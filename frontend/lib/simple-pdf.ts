/**
 * Minimal, dependency-free text PDF writer (PDF 1.4, A4, standard Helvetica fonts, word wrap, pagination).
 *
 * The standard PDF fonts only cover WinAnsi (Latin) characters. Anything else (e.g. Devanagari) is drawn
 * as "?" and reported via `unsupportedChars`, so callers can say so instead of silently losing text.
 *
 * Kept free of Next.js / path-alias imports so it can be unit tested with `node --test`.
 */

export interface PdfLine {
  text?: string;
  /** "rule" draws a horizontal divider instead of text. */
  kind?: "text" | "rule";
  bold?: boolean;
  size?: number;
  muted?: boolean;
  indent?: number;
  /** Extra space (pt) above this line. */
  gapBefore?: number;
}

export interface PdfOptions {
  title?: string;
  /** Inserted after the first line when any character cannot be drawn. */
  unsupportedNote?: string;
}

export interface PdfResult {
  /** Backed by a regular ArrayBuffer, so it can go straight into a Blob. */
  bytes: Uint8Array<ArrayBuffer>;
  pageCount: number;
  unsupportedChars: boolean;
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FOOTER_SPACE = 24;
const DEFAULT_SIZE = 10;
const LEADING = 1.4;

// Helvetica advance widths (1/1000 em) for ASCII 32–126, from the standard AFM metrics.
// prettier-ignore
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD_FACTOR = 1.1; // Helvetica-Bold is up to ~10% wider; keeps wrapped bold lines inside the margin

// Unicode → WinAnsiEncoding for the 0x80–0x9F range (0x20–0x7E and 0xA0–0xFF map to themselves).
const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const QUESTION_MARK = 0x3f;

/** WinAnsi byte codes for a string; unsupported characters become "?". */
export function toWinAnsi(text: string): { codes: number[]; unsupported: boolean } {
  const codes: number[] = [];
  let unsupported = false;
  for (const ch of text.replace(/[\t\r\n]+/g, " ")) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) codes.push(cp);
    else if (WIN_ANSI_EXTRA[cp] !== undefined) codes.push(WIN_ANSI_EXTRA[cp]);
    else {
      codes.push(QUESTION_MARK);
      unsupported = true;
    }
  }
  return { codes, unsupported };
}

function textWidth(codes: number[], size: number, bold: boolean): number {
  const units = codes.reduce((sum, c) => sum + (c >= 32 && c <= 126 ? HELVETICA_WIDTHS[c - 32] : 556), 0);
  return (units * size * (bold ? BOLD_FACTOR : 1)) / 1000;
}

/** Split into lines no wider than maxWidth (breaking inside a word only when it alone is too long). */
export function wrapCodes(codes: number[], maxWidth: number, size: number, bold: boolean): number[][] {
  const words: number[][] = [];
  let current: number[] = [];
  for (const c of codes) {
    if (c === 0x20) {
      if (current.length) words.push(current);
      current = [];
    } else current.push(c);
  }
  if (current.length) words.push(current);
  if (!words.length) return [[]];

  const lines: number[][] = [];
  let line: number[] = [];
  for (let word of words) {
    const candidate = line.length ? [...line, 0x20, ...word] : word;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line.length) lines.push(line);
    line = [];
    while (textWidth(word, size, bold) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && textWidth(word.slice(0, cut), size, bold) > maxWidth) cut--;
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    line = word;
  }
  if (line.length) lines.push(line);
  return lines;
}

/** PDF string literal body: escapes \ ( ) and writes non-ASCII bytes as octal, so the file stays pure ASCII. */
function pdfString(codes: number[]): string {
  let out = "";
  for (const c of codes) {
    if (c === 0x5c || c === 0x28 || c === 0x29) out += "\\" + String.fromCharCode(c);
    else if (c < 0x20 || c > 0x7e) out += "\\" + c.toString(8).padStart(3, "0");
    else out += String.fromCharCode(c);
  }
  return out;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export function buildTextPdf(lines: PdfLine[], options: PdfOptions = {}): PdfResult {
  const unsupportedChars = lines.some((l) => l.text && toWinAnsi(l.text).unsupported);
  const allLines =
    unsupportedChars && options.unsupportedNote
      ? [lines[0], { text: options.unsupportedNote, muted: true, size: 8.5, gapBefore: 2 }, ...lines.slice(1)]
      : lines;

  // ── Layout into pages of drawing operators ──
  const pages: string[][] = [[]];
  const top = PAGE_HEIGHT - MARGIN;
  const bottom = MARGIN + FOOTER_SPACE;
  let y = top;
  const newPage = () => {
    pages.push([]);
    y = top;
  };

  for (const line of allLines) {
    const size = line.size ?? DEFAULT_SIZE;
    const leading = size * LEADING;
    if (y !== top) y -= line.gapBefore ?? 0;
    const x = MARGIN + (line.indent ?? 0);

    if (line.kind === "rule") {
      if (y - 6 < bottom) newPage();
      y -= 4;
      pages[pages.length - 1].push(`0.85 0.87 0.9 RG 0.75 w ${fmt(MARGIN)} ${fmt(y)} m ${fmt(PAGE_WIDTH - MARGIN)} ${fmt(y)} l S`);
      y -= 6;
      continue;
    }

    const { codes } = toWinAnsi(line.text ?? "");
    const bold = !!line.bold;
    for (const segment of wrapCodes(codes, PAGE_WIDTH - MARGIN - x, size, bold)) {
      if (y - leading < bottom) newPage();
      y -= leading;
      const color = line.muted ? "0.42 0.45 0.5 rg" : "0.07 0.09 0.15 rg";
      pages[pages.length - 1].push(
        `BT ${color} /${bold ? "F2" : "F1"} ${fmt(size)} Tf ${fmt(x)} ${fmt(y + size * 0.25)} Td (${pdfString(segment)}) Tj ET`
      );
    }
  }

  // Footer: page numbers
  pages.forEach((ops, i) => {
    const label = toWinAnsi(`Page ${i + 1} of ${pages.length}`).codes;
    const x = PAGE_WIDTH - MARGIN - textWidth(label, 8, false);
    ops.push(`BT 0.42 0.45 0.5 rg /F1 8 Tf ${fmt(x)} ${fmt(MARGIN)} Td (${pdfString(label)}) Tj ET`);
  });

  // ── Serialize ──
  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // returns the new length = 1-based object number
  const catalogId = add(""); // filled below
  const pagesId = add("");
  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const ops of pages) {
    const stream = ops.join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(PAGE_WIDTH)} ${fmt(PAGE_HEIGHT)}] ` +
          `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Title (${pdfString(toWinAnsi(options.title ?? "").codes)}) /Producer (Anveshan admin) >>`);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // Pure ASCII by construction, so string length === byte length (xref offsets are exact).
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
  return { bytes, pageCount: pages.length, unsupportedChars };
}
