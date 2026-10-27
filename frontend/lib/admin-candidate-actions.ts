/**
 * Candidate document actions shared by the All Candidates table and the candidate profile
 * (previously the Admin → Documents tab): documents ZIP, Mark Selected, Mark Not Joined.
 *
 * Each call takes the caller's authenticated fetch (it adds X-Admin-Token) and the candidate ID,
 * so both screens hit the same existing admin endpoints for the same candidate.
 *
 * Kept free of Next.js / path-alias imports so it can be unit tested with `node --test`.
 */

export type AdminFetch = (url: string, opts?: RequestInit) => Promise<Response>;

export type CandidateFlag = "selected" | "notJoined";

const base = (candidateId: string) => `/api/admin/candidates/${encodeURIComponent(candidateId)}`;

export const candidateActionPaths = {
  documentsZip: (candidateId: string) => `${base(candidateId)}/documents/zip`,
  selected: (candidateId: string) => `${base(candidateId)}/mark-selected`,
  notJoined: (candidateId: string) => `${base(candidateId)}/mark-not-joined`,
};

/** Phases at or after the Documents phase (the former Documents tab listed exactly these). */
export const DOCUMENTS_STAGE_PHASES = ["documents", "offer", "signing", "joining"];

/**
 * Status actions (Mark Selected / Mark Not Joined) only for candidates who have reached the Documents
 * phase and submitted all required documents. Both are checked: documents_submitted can outlive a move
 * back to an earlier phase (e.g. an admin re-evaluation to FAIL resets current_phase only).
 */
export function canUseDocumentActions(candidate: {
  documentsSubmitted?: boolean | null;
  currentPhase?: string | null;
  isDeleted?: boolean | null;
}): boolean {
  return (
    Boolean(candidate.documentsSubmitted) &&
    DOCUMENTS_STAGE_PHASES.includes(candidate.currentPhase ?? "") &&
    !candidate.isDeleted
  );
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.detail === "string" && body.detail) || `${fallback} (HTTP ${res.status})`;
}

/**
 * Toggle is_selected / is_not_joined. The backend flips the stored value and returns the new one,
 * which is what callers should display (not a locally negated copy).
 */
export async function toggleCandidateFlag(adminFetch: AdminFetch, candidateId: string, flag: CandidateFlag): Promise<boolean> {
  const res = await adminFetch(candidateActionPaths[flag](candidateId), { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not update candidate status"));
  const body = await res.json();
  const value = flag === "selected" ? body?.is_selected : body?.is_not_joined;
  if (typeof value !== "boolean") throw new Error("Unexpected response while updating candidate status");
  return value;
}

/** All of a candidate's uploaded documents as one ZIP (existing admin endpoint). */
export async function fetchDocumentsZip(adminFetch: AdminFetch, candidateId: string): Promise<Blob> {
  const res = await adminFetch(candidateActionPaths.documentsZip(candidateId));
  if (!res.ok) throw new Error(await errorMessage(res, "Documents ZIP download failed"));
  return res.blob();
}

/** Same naming as the old Documents tab: documents_<name>.zip */
export function documentsZipFilename(fullName: string | null | undefined): string {
  return `documents_${fullName || "candidate"}.zip`;
}
