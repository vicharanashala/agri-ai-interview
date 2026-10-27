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

/** Display names for the internal role codes (display only; codes stay unchanged in data, API and logic). */
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  Intern: "Intern",
  YP: "Young Agriculture Professional",
  Junior: "Junior Agriculture Professional",
  Agri: "Agriculture Professional",
  Senior: "Senior Agriculture Professional",
};

/** Display name for a role code; an unknown value is shown as is. */
export function roleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role] ?? role;
}

/** Role display name only, with no source qualifier: "Senior Agriculture Professional" or "Not available". */
export function roleLabel(effective: string | null | undefined): string {
  return effective ? roleDisplayName(effective) : "Not available";
}

/** "2018–2022", "2023" (end only), "from 2024" (start only) or "—"; non-numeric values count as missing. */
export function yearSpan(start: unknown, end: unknown): string {
  const year = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const s = year(start);
  const e = year(end);
  if (s && e) return `${s}–${e}`;
  if (e) return String(e);
  if (s) return `from ${s}`;
  return "—";
}

/** The parts of a Match result (GET …/match-role) the "Why this role?" explanation is built from. */
export interface MatchWhyInput {
  outcome: "eligible_role" | "suggested" | "cannot_be_checked";
  role: string | null;
  roleSource: string | null;
  yearsOfExperience: number | null;
  education: {
    degree: string;
    level: string;
    discipline: string;
    status: string;
    statusBasis?: string;
    endYear?: number | string;
    /** false when left out of the calculation (completion status not stated). */
    counted?: boolean;
  }[];
  breakdown: { role: string; internReason: string | null; educationLimit: string | null; experienceBand: string | null } | null;
  issues: string[];
}

const MATCH_NA = "Not Available";
const isKnown = (v: string | null | undefined) => !!v && v !== MATCH_NA && v !== "Ambiguous" && v !== "Other";

/** "B.Tech. in Computer Science", else the degree as written. */
export function qualificationLabel(e: { degree: string; level: string; discipline: string }): string {
  if (isKnown(e.level) && isKnown(e.discipline)) return `${e.level} in ${e.discipline}`;
  if (isKnown(e.degree)) return e.degree;
  return isKnown(e.level) ? e.level : "the recorded qualification";
}

/**
 * Plain-language reasons for the Match role, built only from what the eligibility calculation returned (its steps
 * and the education it used), so nothing is claimed that the calculation did not decide. For "cannot be checked"
 * the reasons are the API's issues.
 */
export function matchWhy(m: MatchWhyInput): string[] {
  if (m.outcome === "cannot_be_checked" || !m.role) return m.issues;
  const name = roleDisplayName(m.role);
  const b = m.breakdown;
  if (!b) {
    return [
      `${name} is the eligible role recorded on the candidate profile at onboarding.`,
      "The profile's education details are incomplete, so the qualification and experience steps cannot be shown.",
    ];
  }
  const where = m.outcome === "suggested" ? "the available resume information" : "the candidate profile";
  const college = m.education.filter((e) => e.level !== "School" && e.counted !== false);
  const notCounted = m.education.filter((e) => e.level !== "School" && e.counted === false).map(qualificationLabel);
  const labels = college.map(qualificationLabel);
  // The rules' Horticulture provision: a completed M.Sc./Ph.D. in Horticulture qualifies only together with a
  // completed B.Sc./B.Sc. (Hons.)/Diploma in Agriculture (backend compute_eligible_role). Used for wording only.
  const hortMasters = college.filter(
    (e) => (e.level === "M.Sc." || e.level === "Ph.D.") && e.discipline === "Horticulture" && e.status === "Completed"
  );
  const agriBackground = college.filter(
    (e) => ["B.Sc.", "B.Sc. (Hons.)", "Diploma"].includes(e.level) && e.discipline === "Agriculture" && e.status === "Completed"
  );
  const why: string[] = [];
  if (b.internReason === "no_qualifying_degree" && hortMasters.length && !agriBackground.length) {
    const hort = hortMasters.map(qualificationLabel).join(", ");
    const others = college.filter((e) => !hortMasters.includes(e)).map(qualificationLabel);
    why.push(`${hort} qualifies under the eligibility rules only together with a completed B.Sc. or Diploma in Agriculture.`);
    why.push(`No completed B.Sc. or Diploma in Agriculture was found in ${where}, so this requirement is not met.`);
    if (others.length) {
      why.push(`${others.join(", ")} ${others.length > 1 ? "are not qualifying agricultural qualifications" : "is not a qualifying agricultural qualification"}.`);
    }
  } else if (b.internReason === "no_qualifying_degree") {
    if (labels.length === 1) why.push(`The candidate's qualification (${labels[0]}) is not a qualifying agricultural qualification.`);
    if (labels.length > 1) why.push(`None of the candidate's qualifications (${labels.join(", ")}) is a qualifying agricultural qualification.`);
    why.push(`No completed qualifying agricultural qualification was identified in ${where}.`);
  } else if (b.internReason === "pursuing") {
    const ongoing = college.filter((e) => e.status === "Pursuing");
    const stated = ongoing.filter((e) => e.statusBasis !== "inferred from end year").map(qualificationLabel);
    const fromYear = ongoing.filter((e) => e.statusBasis === "inferred from end year");
    if (stated.length || !fromYear.length) {
      why.push(`The candidate is still pursuing ${stated.length ? stated.join(", ") : "a qualification"}.`);
    }
    for (const e of fromYear) {
      why.push(`${qualificationLabel(e)} ends in ${e.endYear}, an upcoming year, so it is treated as ongoing.`);
    }
    const completed = college.filter((e) => e.status === "Completed").map(qualificationLabel);
    if (completed.length) why.push(`The completed ${completed.join(", ")} is also taken into account.`);
    why.push("A candidate who is still pursuing a qualification is placed as Intern.");
  } else if (b.internReason === "no_education") {
    why.push(`No complete education details were found in ${where}.`);
  } else {
    if (b.educationLimit === "Senior" && hortMasters.length && agriBackground.length) {
      why.push(
        `The candidate's ${hortMasters.map(qualificationLabel).join(", ")}, together with the completed ` +
          `${agriBackground.map(qualificationLabel).join(", ")}, meets the Horticulture rule and allows up to ` +
          `${roleDisplayName(b.educationLimit)}.`
      );
    } else if (b.educationLimit && labels.length) {
      why.push(
        `The candidate's ${labels.length > 1 ? "qualifications" : "qualification"} (${labels.join(", ")}) ` +
          `${labels.length > 1 ? "allow" : "allows"} up to ${roleDisplayName(b.educationLimit)}.`
      );
    }
    if (b.experienceBand && m.yearsOfExperience != null) {
      const years = `${m.yearsOfExperience} ${m.yearsOfExperience === 1 ? "year" : "years"}`;
      why.push(`${years} of experience corresponds to ${roleDisplayName(b.experienceBand)}.`);
    }
  }
  if (notCounted.length) {
    why.push(`${notCounted.join(", ")} ${notCounted.length > 1 ? "are" : "is"} not counted because the completion status is not stated.`);
  }
  if (m.outcome === "eligible_role" && m.roleSource === "stored" && b.role !== m.role) {
    why.push(`${name} is the eligible role recorded at onboarding; the current profile details give ${roleDisplayName(b.role)}.`);
    return why;
  }
  why.push(`Under the existing eligibility rules, the ${m.outcome === "suggested" ? "suggested" : "eligible"} role is ${name}.`);
  return why;
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
