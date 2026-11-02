/**
 * Content of the "Consent & Declarations" PDF on the admin candidate profile.
 *
 * Built only from the profile API response: values that are missing are reported as "Not recorded",
 * never filled in. Rendering is done by lib/simple-pdf.ts.
 *
 * Only type imports (erased by Node's type stripping), so it can be unit tested with `node --test`.
 */
import type { PdfLine } from "./simple-pdf";

type Text = string | null | undefined;

export interface ConsentPdfDeclaration {
  key: string;
  label: string;
  present: boolean;
  consentName?: Text;
  accepted?: boolean;
  acceptedAt?: Text;
  withdrawnAt?: Text;
  fullName?: Text;
  signature?: Text;
  extra?: Record<string, string | number | boolean>;
}

export interface ConsentPdfDeclarationCycle {
  cycle?: number;
  allAccepted: boolean;
  declarationAcceptedAt?: Text;
  withdrawn?: boolean;
  withdrawnAt?: Text;
  records: ConsentPdfDeclaration[];
}

export interface ConsentPdfInput {
  candidate: { id: string; fullName?: Text; email?: Text; phone?: Text };
  consent: {
    status?: Text;
    timestamp?: Text;
    withdrawn?: boolean;
    withdrawnAt?: Text;
  };
  declarations: {
    allAccepted: boolean;
    declarationAcceptedAt?: Text;
    withdrawn?: boolean;
    withdrawnAt?: Text;
    records: ConsentPdfDeclaration[];
    history?: ConsentPdfDeclarationCycle[];
  };
  generatedAt: string;
}

export const CONSENT_PDF_TITLE = "Consent & Declarations";
export const UNSUPPORTED_CHARS_NOTE =
  "Note: some characters (for example non-Latin scripts) cannot be shown with the PDF's standard fonts and appear as \"?\". The candidate profile page shows the original text.";

const NOT_RECORDED = "Not recorded";

const humanize = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());

const has = (v: Text): v is string => typeof v === "string" && v.trim() !== "";

/** "Label: value" lines; `formatDateTime` is the page's IST formatter, injected to keep this module pure. */
export function consentPdfLines(input: ConsentPdfInput, formatDateTime: (iso: string) => string): PdfLine[] {
  const field = (label: string, value: string, indent = 0): PdfLine => ({ text: `${label}: ${value}`, indent });
  const stamp = (iso: string) => {
    const formatted = formatDateTime(iso);
    return formatted === iso ? iso : `${formatted} (${iso})`;
  };
  const { candidate, consent, declarations } = input;

  const lines: PdfLine[] = [
    { text: CONSENT_PDF_TITLE, bold: true, size: 16 },
    { text: `Generated ${input.generatedAt}`, muted: true, size: 9, gapBefore: 2 },
    { kind: "rule", gapBefore: 6 },
    { text: "Candidate", bold: true, size: 12, gapBefore: 6 },
  ];
  if (has(candidate.fullName)) lines.push(field("Name", candidate.fullName));
  if (has(candidate.email)) lines.push(field("Email", candidate.email));
  if (has(candidate.phone)) lines.push(field("Phone", candidate.phone));
  lines.push(field("Candidate ID", candidate.id));

  lines.push({ text: "Consent status", bold: true, size: 12, gapBefore: 10 });
  lines.push(field("Status", has(consent.status) ? humanize(consent.status) : NOT_RECORDED));


  const rawCycles = (declarations.history && declarations.history.length > 0)
    ? declarations.history
    : [{
        allAccepted: declarations.allAccepted,
        declarationAcceptedAt: declarations.declarationAcceptedAt,
        withdrawn: consent.withdrawn,
        withdrawnAt: consent.withdrawnAt,
        records: declarations.records,
      }];

  // Show the latest consent cycle at the top
  const cycles = [...rawCycles].sort((a, b) => {
    if (a.cycle != null && b.cycle != null) return b.cycle - a.cycle;
    const timeA = new Date(a.declarationAcceptedAt || a.withdrawnAt || 0).getTime();
    const timeB = new Date(b.declarationAcceptedAt || b.withdrawnAt || 0).getTime();
    return timeB - timeA;
  });

  cycles.forEach((cycle, cycleIdx) => {
    if (cycleIdx > 0) {
      lines.push({ kind: "rule", gapBefore: 12 });
    }
    if (cycle.withdrawn) {
      lines.push(field("Consent status", "Withdrawn"));
      if (has(cycle.withdrawnAt)) lines.push(field("Withdrawn at", stamp(cycle.withdrawnAt)));
      lines.push(field("All four declarations accepted", "No (Withdrawn)"));
    } else if (cycle.records.some((r) => r.present)) {
      lines.push(field("All four declarations accepted", cycle.allAccepted ? "Yes" : "No"));
    }
    if (has(cycle.declarationAcceptedAt)) lines.push(field("Declarations submitted", stamp(cycle.declarationAcceptedAt)));

    cycle.records.forEach((r, i) => {
      lines.push({ kind: "rule", gapBefore: 8 });
      lines.push({ text: `Declaration ${i + 1} of ${cycle.records.length}`, muted: true, size: 9, gapBefore: 4 });
      lines.push({ text: has(r.consentName) ? r.consentName : r.label, bold: true, size: 11 });
      if (has(r.consentName) && r.consentName !== r.label) lines.push({ text: r.label, muted: true, size: 9 });

      if (!r.present) {
        lines.push(field("Status", NOT_RECORDED));
        return;
      }
      lines.push(field("Status", cycle.withdrawn || !r.accepted ? "Rejected" : "Accepted"));
      lines.push(field("Signer name", has(r.fullName) ? r.fullName : NOT_RECORDED));
      lines.push(field("Signature", has(r.signature) ? r.signature : NOT_RECORDED));
      lines.push(field("Accepted at", has(r.acceptedAt) ? stamp(r.acceptedAt) : NOT_RECORDED));
      const wAt = has(r.withdrawnAt) ? r.withdrawnAt : has(cycle.withdrawnAt) ? cycle.withdrawnAt : null;
      if (cycle.withdrawn && wAt) {
        lines.push(field("Withdrawn at", stamp(wAt)));
      }
      const extra = r.extra || {};
      if (extra.version !== undefined) lines.push(field("Version", String(extra.version)));
      for (const [key, value] of Object.entries(extra)) {
        if (key === "version" || key === "withdrawnAt" || key === "withdrawn_at") continue;
        lines.push(field(humanize(key), typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)));
      }
    });
  });
  return lines;
}

/** e.g. "Consent_Declarations_Asha_K.pdf"; falls back to the candidate ID (e.g. for non-Latin names). */
export function consentPdfFilename(fullName: Text, candidateId: string): string {
  const safe = (s: Text) => (s || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `Consent_Declarations_${safe(fullName) || safe(candidateId) || "candidate"}.pdf`;
}
