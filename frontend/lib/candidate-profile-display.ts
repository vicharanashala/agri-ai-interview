/**
 * Display rules for the admin candidate profile (labels and derived display state only — no data changes).
 *
 * Kept free of Next.js / path-alias imports so it can be unit tested with `node --test`
 * (see tests/candidate-profile-display.test.mjs).
 */

/**
 * Interview scores are on a fixed 0–100 scale: the backend computes
 * overall_score = int(mean of six 0–10 topic scores × 10) (backend/app/llm/service.py, generate_interview_evaluation).
 * The profile API has no per-interview maximum, so the scale is mirrored here.
 */
export const MAX_INTERVIEW_SCORE = 100;

export const ROLE_UNAVAILABLE_TOOLTIP =
  "No stored role, and the education/experience data is not complete enough to calculate one reliably.";

export const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  interview: "Interview",
  summary: "Summary",
  foundation: "Foundation Course",
  module: "Ground Truth",
  documents: "Documents",
};

const humanize = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] || humanize(phase);
}

/**
 * Status of one step in the phase progress indicator. The backend derives steps from current_phase only,
 * so the final Documents step stays "in progress" after submission; documentsSubmitted (set only once all
 * required documents are uploaded) marks it completed.
 */
export function phaseStepStatus(phase: string, status: string, documentsSubmitted: boolean): string {
  if (phase === "documents" && documentsSubmitted) return "completed";
  return status;
}

/** Role text without the "stored" qualifier: "Senior", "Senior (calculated)" or "Not available". */
export function roleLabel(effective: string | null | undefined, source: string | null | undefined): string {
  if (!effective) return "Not available";
  return source === "calculated" ? `${effective} (calculated)` : effective;
}

export function isRoleUnavailable(effective: string | null | undefined): boolean {
  return !effective;
}

export interface ScoreDetails {
  obtained: string;
  maximum: string;
  threshold: string;
}

/** Values for the Score Obtained / Maximum Score / Pass Threshold row of an interview attempt. */
export function scoreDetails(score: number | null | undefined, passThreshold: number | null | undefined): ScoreDetails {
  const hasNumber = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  return {
    obtained: hasNumber(score) ? String(score) : "Not available",
    maximum: String(MAX_INTERVIEW_SCORE),
    threshold: hasNumber(passThreshold) ? `${passThreshold}/${MAX_INTERVIEW_SCORE}` : "Not available",
  };
}

/**
 * Category label for an uploaded document, e.g. "Aadhaar Card"; when a category holds several files
 * (fields can take more than one upload) the file number is added: "Aadhaar Card · File 2".
 */
export function documentCategoryLabel(
  doc: { fieldName?: string | null; fileIndex?: number | null },
  allDocs: { fieldName?: string | null }[]
): string {
  const label = doc.fieldName ? humanize(doc.fieldName) : "Document";
  const inCategory = allDocs.filter((d) => d.fieldName === doc.fieldName).length;
  return inCategory > 1 && doc.fileIndex ? `${label} · File ${doc.fileIndex}` : label;
}
