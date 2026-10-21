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

/** Role name only, with no source qualifier: "Senior" or "Not available". */
export function roleLabel(effective: string | null | undefined): string {
  return effective || "Not available";
}

export function isRoleUnavailable(effective: string | null | undefined): boolean {
  return !effective;
}

export type ProgressStatus = "completed" | "in_progress" | "not_started" | "unavailable" | "not_available_then";

export const PROGRESS_STATUS_LABELS: Record<ProgressStatus, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  not_started: "Not Started",
  unavailable: "Status Unavailable",
  not_available_then: "Not Available at That Time",
};

/**
 * Earliest moment the Ground Truth (Annadathaa) module could have been available anywhere: the commit that first
 * added it — module page, Annadathaa completion check, "module" phase and module_status
 * (c893493 "feat:module-phase", 2026-09-26 12:53:21 IST; merged to main 2026-10-07 in PR #71).
 * Deployments are manual, so the actual go-live is later; using the earliest possible time keeps the rule conservative.
 */
export const GROUND_TRUTH_EARLIEST_AVAILABLE = Date.parse("2026-09-26T07:23:21Z");

const PHASE_ORDER = ["onboarding", "interview", "summary", "foundation", "module", "documents"];

/**
 * Progress of one post-interview step (Foundation Course on Vibe, Ground Truth module on Annadathaa) from the stored
 * completion flag and status. The API reports a missing status as "not_started", so a candidate already past the step
 * (or with documents submitted) but with no completion record is "unavailable" rather than a guessed "not started" —
 * e.g. candidates who reached Documents before the module existed. Unrecognised statuses are also "unavailable".
 */
export function progressStatus(
  step: "foundation" | "module",
  completed: boolean | null | undefined,
  status: string | null | undefined,
  currentPhase: string,
  documentsSubmitted: boolean
): ProgressStatus {
  if (completed === true || status === "completed") return "completed";
  const stepIdx = PHASE_ORDER.indexOf(step);
  const phaseIdx = PHASE_ORDER.indexOf(currentPhase);
  if (documentsSubmitted || (phaseIdx !== -1 && phaseIdx > stepIdx)) return "unavailable";
  if (status === "in_progress") return "in_progress";
  if (status === null || status === undefined || status === "not_started") return "not_started";
  return "unavailable";
}

/**
 * Ground Truth status. "Not Available at That Time" only with evidence that the candidate reached Documents before the
 * module existed: Foundation completed, the module never launched or completed, and a document uploaded before
 * GROUND_TRUTH_EARLIEST_AVAILABLE (upload times are written once at insert and need Foundation completed). Without
 * that evidence the usual rules apply, so a candidate past the module with no record stays "Status Unavailable".
 */
export function groundTruthStatus(
  moduleCompleted: boolean | null | undefined,
  moduleStatus: string | null | undefined,
  foundationCompleted: boolean | null | undefined,
  foundationStatus: string | null | undefined,
  documentUploadTimes: (string | null | undefined)[],
  currentPhase: string,
  documentsSubmitted: boolean
): ProgressStatus {
  const neverLaunched = moduleCompleted !== true && (moduleStatus == null || moduleStatus === "not_started");
  const foundationDone = foundationCompleted === true || foundationStatus === "completed";
  const uploadedBeforeModule = documentUploadTimes.some((t) => {
    const ms = t ? Date.parse(t) : NaN;
    return Number.isFinite(ms) && ms < GROUND_TRUTH_EARLIEST_AVAILABLE;
  });
  if (neverLaunched && foundationDone && uploadedBeforeModule) return "not_available_then";
  return progressStatus("module", moduleCompleted, moduleStatus, currentPhase, documentsSubmitted);
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
