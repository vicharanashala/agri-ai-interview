"use client";

import { useState, useEffect, useCallback, useId, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./profile.module.css";
import { hasLegacyEducation as anyLegacyEducation, shouldShowLegacyEducation } from "@/lib/legacy-education";
import {
  PROGRESS_STATUS_LABELS,
  ROLE_UNAVAILABLE_TOOLTIP,
  documentCategoryLabel,
  isRoleUnavailable,
  phaseLabel,
  phaseStepStatus,
  groundTruthStatus,
  progressStatus,
  roleLabel,
  scoreDetails,
  type ProgressStatus,
} from "@/lib/candidate-profile-display";
import { buildTextPdf } from "@/lib/simple-pdf";
import { CONSENT_PDF_TITLE, UNSUPPORTED_CHARS_NOTE, consentPdfFilename, consentPdfLines } from "@/lib/consent-pdf";
import { DocumentsZipButton } from "@/components/admin/CandidateDocumentActions";

// ─── Types (mirror GET /api/admin/candidates/{id}/profile) ──────────────────

interface PhaseStatus {
  phase: string;
  status: string;
}

interface EducationEntry {
  level?: string | null;
  levelOther?: string | null;
  discipline?: string | null;
  disciplineOther?: string | null;
  status?: string | null;
  institution?: string | null;
  yearOfCompletion?: string | null;
}

interface DeclarationRecord {
  key: string;
  label: string;
  present: boolean;
  consentName?: string | null;
  accepted?: boolean;
  acceptedAt?: string | null;
  fullName?: string | null;
  signature?: string | null;
  extra?: Record<string, string | number | boolean>;
}

interface ParsedResumeData {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  skills?: string[];
  experience?: { company?: string; title?: string; duration?: string; highlights?: string[] }[];
  education?: { institution?: string; degree?: string; year?: string }[];
  summary?: string | null;
  confidence_score?: number;
}

interface ResumeRecord {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  createdAt?: string | null;
  parsedData?: ParsedResumeData | null;
  rawText?: string | null;
}

interface ReEvaluation {
  status?: string | null;
  reason?: string | null;
  requestedAt?: string | null;
  completedAt?: string | null;
  scoreAfter?: number | null;
  resultAfter?: string | null;
}

interface InterviewSummary {
  id: string;
  status?: string | null;
  result?: string | null;
  score?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  endReason?: string | null;
  attempt?: number | null;
  hasEvaluation: boolean;
  reEvaluation?: ReEvaluation | null;
}

interface DocumentRecord {
  id: string;
  fieldName: string;
  fileIndex?: number | null;
  fileName: string;
  fileType: string;
  createdAt?: string | null;
}

interface CandidateProfile {
  id: string;
  fullName?: string | null;
  userName?: string | null;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  district?: string | null;
  address?: string | null;
  pincode?: string | null;
  currentPhase: string;
  phases: PhaseStatus[];
  createdAt?: string | null;
  updatedAt?: string | null;
  profileCompletedAt?: string | null;
  attemptsDone: number;
  maxAttempts: number;
  interviewStatus?: string | null;
  foundationCourseCompleted?: boolean | null;
  foundationCourseStatus?: string | null;  moduleCompleted?: boolean | null;
  moduleStatus?: string | null;
  documentsSubmitted: boolean;
  isSelected: boolean;
  isNotJoined: boolean;
  isDeleted: boolean;
  deletedAt?: string | null;
  profile: {
    currentRole?: string | null;
    yearsOfExperience?: number | null;
    farmingBackground?: string | null;
    primaryExpertise?: string | null;
    cropsGrown?: string | null;
    farmSize?: string | null;
    nonAgriConsent?: boolean | null;
    isInternshipConsent?: boolean | null;
  };
  education: EducationEntry[];
  legacyEducation: {
    highestEducation?: string | null;
    institution?: string | null;
    discipline?: string | null;
    disciplineOther?: string | null;
    educationStatus?: string | null;
  };
  role: {
    stored?: string | null;
    storedInvalid?: string | null;
    calculated?: string | null;
    effective?: string | null;
    source?: "stored" | "calculated" | null;
    passThreshold?: number | null;
  };
  consent: {
    status?: string | null;
    accepted?: boolean;
    inferredFromDocuments?: boolean;
    timestamp?: string | null;
    withdrawn?: boolean;
    withdrawnAt?: string | null;
  };
  declarations: {
    allAccepted: boolean;
    declarationAcceptedAt?: string | null;
    source?: string | null;
    records: DeclarationRecord[];
  };
  resumes: ResumeRecord[];
  interviews: InterviewSummary[];
  documents: DocumentRecord[];
}

// ─── Constants & helpers ────────────────────────────────────────────────────

// Same base as the admin dashboard: talk to the backend directly with X-Admin-Token.
const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

// Set by the dashboard when it opens a profile from the candidates table (same browser tab)
const PROFILE_OPENED_FROM_DASHBOARD_KEY = "admin_profile_opened_from_dashboard";
const DASHBOARD_QUERY_KEYS = ["tab", "q", "phase", "state", "district", "interview", "page", "limit"];

/** Dashboard query to return to: only known view keys from ?from=, always on the Candidates or Trash tab. */
function dashboardReturnQuery(from: string | null, isDeleted?: boolean): string {
  const source = new URLSearchParams(from || "");
  const query = new URLSearchParams();
  for (const key of DASHBOARD_QUERY_KEYS) {
    const value = source.get(key);
    if (value) query.set(key, value);
  }
  const tab = query.get("tab");
  if (tab !== "candidates" && tab !== "trash") query.set("tab", isDeleted ? "trash" : "candidates");
  return query.toString();
}

const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  not_attended: "Not attended",
  pass: "Passed",
  fail: "Failed",
  requested_revaluation: "Re-evaluation requested",
};

const END_REASON_LABELS: Record<string, string> = {
  anti_cheat: "Anti-cheat trigger",
  withdrawn: "Candidate withdrew",
  question_limit: "Question limit reached",
  time_limit: "Time limit exceeded",
  auto: "Auto-completed",
  completed: "Completed",
};

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const humanize = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.replace(/\+00:00Z$/, "+00:00"));
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

/** Full timestamp to the second, in IST — used where the exact moment matters (consents, signatures). */
function formatDateTime(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return iso || "—";
  return (
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }) + " IST"
  );
}

function durationLabel(start?: string | null, end?: string | null): string | null {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e || e < s) return null;
  const mins = Math.round((e.getTime() - s.getTime()) / 60000);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

function educationValue(value?: string | null, other?: string | null): string | null {
  if (isBlank(value)) return isBlank(other) ? null : other!;
  if (value && value.startsWith("Other") && !isBlank(other)) return `${value} (${other})`;
  return value!;
}

function yesNo(v?: boolean | null): string | null {
  return v === null || v === undefined ? null : v ? "Yes" : "No";
}

// ─── Small presentational components ────────────────────────────────────────

function Field({ label, value, mono, wide }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
  if (isBlank(value)) return null;
  return (
    <div className={`${styles.field} ${wide ? styles.fieldWide : ""}`}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={`${styles.fieldValue} ${mono ? styles.mono : ""}`}>{value}</dd>
    </div>
  );
}

/** Like Field, but always rendered (missing values say so), so fixed rows keep their columns aligned. */
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={styles.fieldValue}>{isBlank(value) ? "Not available" : value}</dd>
    </div>
  );
}

function Card({ title, icon, children, actions }: { title: string; icon: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <span className={styles.cardIcon} aria-hidden>{icon}</span>
          {title}
        </h2>
        {actions}
      </header>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

type Tone = "green" | "red" | "amber" | "blue" | "gray";

function Badge({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${tone}`]}`} title={title}>
      {children}
    </span>
  );
}

const PROGRESS_TONES: Record<ProgressStatus, Tone> = {
  completed: "green",
  in_progress: "amber",
  not_started: "gray",
  unavailable: "gray",
  not_available_then: "blue",
};

const PROGRESS_TOOLTIPS: Partial<Record<ProgressStatus, string>> = {
  unavailable: "The candidate moved past this step without a completion record, or the stored status is not recognised.",
  not_available_then: "The candidate uploaded documents before the Ground Truth module was introduced.",
};

/** One Vibe course or Annadathaa module in the Candidate Progress Status card. */
function ProgressItem({ platform, name, kind, status }: { platform: string; name: string; kind: string; status: ProgressStatus }) {
  return (
    <div className={styles.progressCard}>
      <div className={styles.docCardHead}>
        <span className={styles.docCategory}>{platform}</span>
        <span className={styles.muted}>{kind}</span>
      </div>
      <div className={styles.progressItem}>
        <strong>{name}</strong>
        <Badge tone={PROGRESS_TONES[status]} title={PROGRESS_TOOLTIPS[status]}>
          {PROGRESS_STATUS_LABELS[status]}
        </Badge>
      </div>
    </div>
  );
}

function interviewStatusTone(status?: string | null): Tone {
  if (status === "pass") return "green";
  if (status === "fail") return "red";
  if (status === "requested_revaluation") return "amber";
  return "gray";
}

function ParsedResumeView({ data }: { data: ParsedResumeData }) {
  const skills = data.skills || [];
  const experience = data.experience || [];
  const education = data.education || [];
  return (
    <div className={styles.parsedResume}>
      {data.summary && <p className={styles.parsedSummary}>“{data.summary}”</p>}
      {(data.name || data.email || data.phone) && (
        <p className={styles.muted}>
          Detected: {[data.name, data.email, data.phone].filter(Boolean).join(" · ")}
        </p>
      )}
      {skills.length > 0 && (
        <div>
          <h4 className={styles.subheading}>Skills ({skills.length})</h4>
          <div className={styles.chips}>
            {skills.map((s, i) => (
              <span key={i} className={styles.chip}>{s}</span>
            ))}
          </div>
        </div>
      )}
      {experience.length > 0 && (
        <div>
          <h4 className={styles.subheading}>Experience</h4>
          {experience.map((exp, i) => (
            <div key={i} className={styles.listItem}>
              <strong>{exp.title || "—"}</strong>
              <div className={styles.muted}>
                {[exp.company, exp.duration].filter(Boolean).join(" · ")}
              </div>
              {exp.highlights && exp.highlights.length > 0 && (
                <ul className={styles.bullets}>
                  {exp.highlights.map((h, j) => <li key={j}>{h}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {education.length > 0 && (
        <div>
          <h4 className={styles.subheading}>Education (from resume)</h4>
          {education.map((edu, i) => (
            <div key={i} className={styles.listItem}>
              <strong>{edu.degree || "—"}</strong>
              <div className={styles.muted}>{[edu.institution, edu.year].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hover/focus tooltip (a native title attribute would not show on keyboard focus). */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className={styles.tooltipAnchor} tabIndex={0} aria-describedby={id}>
      {children}
      <span id={id} role="tooltip" className={styles.tooltip}>
        {text}
      </span>
    </span>
  );
}

/** Eligible role text; explains itself on hover/focus when no role is available. */
function RoleText({ role, prefix = "" }: { role: CandidateProfile["role"]; prefix?: string }) {
  const text = `${prefix}${roleLabel(role.effective)}`;
  return isRoleUnavailable(role.effective) ? <Tooltip text={ROLE_UNAVAILABLE_TOOLTIP}>{text}</Tooltip> : <>{text}</>;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminCandidateProfilePage() {
  const router = useRouter();
  const params = useParams<{ candidateId: string }>();
  const candidateId = params?.candidateId ? decodeURIComponent(params.candidateId) : "";

  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [openResumes, setOpenResumes] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [fromParam, setFromParam] = useState<string | null>(null);

  useEffect(() => {
    setFromParam(new URLSearchParams(window.location.search).get("from"));
  }, []);

  const withAuth = useCallback((url: string, opts: RequestInit = {}) => {
    const token = typeof window === "undefined" ? null : localStorage.getItem("admin_token");
    const headers = {
      ...(token ? { "X-Admin-Token": token } : {}),
      ...((opts.headers as Record<string, string>) || {}),
    };
    return fetch(`${ADMIN_API_BASE}${url}`, { ...opts, headers, credentials: "include" });
  }, []);

  const goToLogin = useCallback(() => router.push("/admin/login"), [router]);

  // Verify the admin session before requesting any candidate data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await withAuth("/api/admin/auth/session");
        if (cancelled) return;
        if (!res.ok) return goToLogin();
        setAuthChecked(true);
      } catch {
        if (!cancelled) goToLogin();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [withAuth, goToLogin]);

  const loadProfile = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await withAuth(`/api/admin/candidates/${encodeURIComponent(candidateId)}/profile`);
      if (res.status === 401) return goToLogin();
      if (res.status === 404) return setLoadState("not_found");
      if (!res.ok) {
        setErrorMsg(`The profile could not be loaded (HTTP ${res.status}).`);
        return setLoadState("error");
      }
      setProfile(await res.json());
      setLoadState("ready");
    } catch {
      setErrorMsg("The profile could not be loaded. Check your connection and try again.");
      setLoadState("error");
    }
  }, [withAuth, goToLogin, candidateId]);

  useEffect(() => {
    if (authChecked && candidateId) loadProfile();
  }, [authChecked, candidateId, loadProfile]);

  const returnQuery = dashboardReturnQuery(fromParam, profile?.isDeleted);
  const returnLabel = new URLSearchParams(returnQuery).get("tab") === "trash" ? "Trash" : "All Candidates";

  const backToCandidates = () => {
    let openedFromDashboard = false;
    try {
      openedFromDashboard = sessionStorage.getItem(PROFILE_OPENED_FROM_DASHBOARD_KEY) === window.location.pathname;
      sessionStorage.removeItem(PROFILE_OPENED_FROM_DASHBOARD_KEY);
    } catch {
      // Storage unavailable — navigate via ?from= below
    }
    // Same as the browser Back button when we came straight from the table: one history entry, same view
    if (openedFromDashboard && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/admin/dashboard?${returnQuery}`);
  };

  const handleLogout = async () => {
    try {
      await withAuth("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Best-effort: still redirect even if the call fails
    }
    router.push("/admin/login");
  };

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Authenticated fetch → Blob → save, so the admin token never appears in a URL. */
  const downloadFile = async (key: string, path: string, filename: string) => {
    setDownloading(key);
    setDownloadError("");
    try {
      const res = await withAuth(path);
      if (res.status === 401) return goToLogin();
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Download failed (HTTP ${res.status})`);
      }
      saveBlob(await res.blob(), filename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  /** Consent & declarations as a PDF, generated in the browser from the loaded profile data. */
  const downloadConsentPdf = () => {
    if (!profile) return;
    setDownloading("consent-pdf");
    setDownloadError("");
    try {
      const lines = consentPdfLines(
        {
          candidate: { id: profile.id, fullName: profile.fullName, email: profile.email, phone: profile.phone },
          consent: profile.consent,
          declarations: profile.declarations,
          generatedAt: formatDateTime(new Date().toISOString()),
        },
        formatDateTime
      );
      const pdf = buildTextPdf(lines, { title: CONSENT_PDF_TITLE, unsupportedNote: UNSUPPORTED_CHARS_NOTE });
      saveBlob(new Blob([pdf.bytes], { type: "application/pdf" }), consentPdfFilename(profile.fullName, profile.id));
    } catch (err) {
      setDownloadError(`Could not generate the consent PDF${err instanceof Error && err.message ? `: ${err.message}` : "."}`);
    } finally {
      setDownloading(null);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(profile?.id || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available — the ID is still selectable
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const header = (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button className={styles.backBtn} onClick={backToCandidates}>
          ← {returnLabel}
        </button>
        <h1 className={styles.logo}>Candidate Profile</h1>
      </div>
      <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
    </header>
  );

  if (!authChecked) {
    return <div className={styles.loadingPage}>Loading...</div>;
  }

  if (loadState !== "ready" || !profile) {
    return (
      <div className={styles.container}>
        {header}
        <main className={styles.main}>
          {loadState === "loading" && (
            <div className={styles.skeletonWrap} aria-busy="true">
              <div className={`${styles.skeleton} ${styles.skeletonHero}`} />
              <div className={styles.columns}>
                <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
                <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
              </div>
              <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
            </div>
          )}
          {loadState === "not_found" && (
            <div className={styles.statePanel}>
              <h2>Candidate not found</h2>
              <p>This candidate does not exist or has been permanently removed.</p>
              <button className={styles.primaryBtn} onClick={backToCandidates}>Back to {returnLabel}</button>
            </div>
          )}
          {loadState === "error" && (
            <div className={styles.statePanel}>
              <h2>Something went wrong</h2>
              <p>{errorMsg}</p>
              <button className={styles.primaryBtn} onClick={loadProfile}>Try again</button>
            </div>
          )}
        </main>
      </div>
    );
  }

  const p = profile;
  const displayName = p.fullName || p.userName || p.email || "Unnamed candidate";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const location = [p.district, p.state].filter(Boolean).join(", ");
  const legacy = p.legacyEducation;
  const hasLegacyEducation = anyLegacyEducation(legacy);
  // Hidden when the legacy fields only duplicate an education[] entry (see lib/legacy-education.ts)
  const showLegacyEducation = shouldShowLegacyEducation(legacy, p.education);
  const prof = p.profile;
  // The consent acknowledgements are not shown on this card, so they don't count as profile details.
  const { nonAgriConsent: _nonAgri, isInternshipConsent: _internship, ...shownProf } = prof;
  const hasProfileDetails = Object.values(shownProf).some((v) => !isBlank(v));
  const presentDeclarations = p.declarations.records.filter((r) => r.present);
  const base = `/api/admin/candidates/${encodeURIComponent(p.id)}`;

  return (
    <div className={styles.container}>
      {header}

      <main className={styles.main}>
        {p.isDeleted && (
          <div className={styles.trashBanner} role="status">
            🗑️ This candidate is in the Trash{p.deletedAt ? ` (removed ${formatDateTime(p.deletedAt)})` : ""}. Use
            right-click → Restore in the Trash tab to restore them.
          </div>
        )}
        {downloadError && (
          <div className={styles.errorBanner} role="alert">
            {downloadError}
            <button className={styles.linkBtn} onClick={() => setDownloadError("")}>Dismiss</button>
          </div>
        )}

        {/* ── Banner: identity, key status, resume, phase progress ── */}
        <section className={styles.banner}>
          <div className={styles.bannerTop}>
            <div className={styles.avatar} aria-hidden>{initials || "?"}</div>
            <div className={styles.heroInfo}>
              <h2 className={styles.heroName}>{displayName}</h2>
              <div className={styles.contactLine}>
                {p.email && <span>✉️ {p.email}</span>}
                {p.phone && <span>📞 {p.phone}</span>}
                {location && <span>📍 {location}</span>}
                {!p.email && !p.phone && !location && <span>No contact details recorded</span>}
              </div>
              <div className={styles.badges}>
                <Badge tone="green" title="Current phase">
                  Phase: {phaseLabel(p.currentPhase)}
                </Badge>
                {p.interviewStatus && (
                  <Badge tone={interviewStatusTone(p.interviewStatus)} title="Latest interview result">
                    Interview: {INTERVIEW_STATUS_LABELS[p.interviewStatus] || humanize(p.interviewStatus)}
                  </Badge>
                )}
                {p.role.effective ? (
                  <Badge tone="blue" title={p.role.source === "calculated" ? "Calculated from education and experience" : undefined}>
                    <RoleText role={p.role} prefix="Role: " />
                  </Badge>
                ) : (
                  <Badge tone="gray">
                    <RoleText role={p.role} prefix="Role: " />
                  </Badge>
                )}
                {p.isSelected && <Badge tone="green">Selected</Badge>}
                {p.isNotJoined && <Badge tone="amber">Not joined</Badge>}
                {p.isDeleted && <Badge tone="red">In Trash</Badge>}
              </div>
            </div>
            <div className={styles.heroStats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{p.attemptsDone}/{p.maxAttempts}</span>
                <span className={styles.statLabel}>Attempts</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{formatDate(p.createdAt)}</span>
                <span className={styles.statLabel}>Registered</span>
              </div>
            </div>
          </div>

          {/* Resume(s) */}
          <div className={styles.bannerSection}>
            <h3 className={styles.bannerSectionTitle}>
              📄 {p.resumes.length > 1 ? `Resumes (${p.resumes.length})` : "Resume"}
            </h3>
            {p.resumes.length === 0 ? (
              <Empty>No resume uploaded.</Empty>
            ) : (
              <div className={styles.resumeList}>
                {p.resumes.map((r, idx) => {
                  const key = `resume:${r.id}`;
                  const open = !!openResumes[r.id];
                  const statusTone: Tone = r.status === "parsed" ? "green" : r.status === "failed" ? "red" : "amber";
                  return (
                    <div key={r.id} className={styles.resumeItem}>
                      <div className={styles.resumeRow}>
                        <span className={styles.fileTypeTag}>{r.fileType ? r.fileType.toUpperCase() : "FILE"}</span>
                        <div className={styles.fileInfo}>
                          <span className={styles.fileName}>{r.fileName || "Resume"}</span>
                          <span className={styles.muted}>
                            Uploaded {formatDateTime(r.createdAt)}
                            {idx === 0 && p.resumes.length > 1 ? " · Latest" : ""}
                          </span>
                        </div>
                        <Badge tone={statusTone}>
                          {r.status === "parsed" && r.parsedData?.confidence_score != null
                            ? `Parsed · ${Math.round(r.parsedData.confidence_score * 100)}%`
                            : humanize(r.status)}
                        </Badge>
                        <div className={styles.fileActions}>
                          {(r.parsedData || r.rawText) && (
                            <button
                              className={styles.secondaryBtn}
                              onClick={() => setOpenResumes((prev) => ({ ...prev, [r.id]: !open }))}
                              aria-expanded={open}
                            >
                              {open ? "Hide preview" : "Preview"}
                            </button>
                          )}
                          <button
                            className={styles.primaryBtn}
                            disabled={downloading === key}
                            onClick={() =>
                              downloadFile(key, `${base}/resumes/${encodeURIComponent(r.id)}/download`, r.fileName || "resume")
                            }
                          >
                            {downloading === key ? "Downloading…" : "⬇ Download"}
                          </button>
                        </div>
                      </div>
                      {open && (
                        <div className={styles.expandBody}>
                          {r.parsedData ? (
                            <ParsedResumeView data={r.parsedData} />
                          ) : (
                            <pre className={styles.rawText}>{r.rawText}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Phase progress */}
          <div className={styles.progress} aria-label="Phase progress">
            {(p.phases || []).map((ph, i) => {
              const status = phaseStepStatus(ph.phase, ph.status, p.documentsSubmitted);
              return (
                <div
                  key={ph.phase}
                  className={`${styles.step} ${status === "completed" ? styles.stepDone : status === "in_progress" ? styles.stepActive : ""}`}
                >
                  <span className={styles.stepDot}>{status === "completed" ? "✓" : i + 1}</span>
                  <span className={styles.stepLabel}>{phaseLabel(ph.phase)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Overview | Profile & Experience ── */}
        <div className={styles.columns}>
          <Card title="Overview" icon="👤">
            <dl className={styles.fieldGrid}>
              <Field label="Full name" value={p.fullName} />
              <Field label="Email" value={p.email} />
              <Field label="Phone" value={p.phone} />
              <Field label="State" value={p.state} />
              <Field label="District" value={p.district} />
              <Field label="Pincode" value={p.pincode} />
              <Field label="Address" value={p.address} wide />
              <Field label="Current phase" value={phaseLabel(p.currentPhase)} />
              <Field label="Documents submitted" value={yesNo(p.documentsSubmitted)} />
              <Field label="Created" value={formatDateTime(p.createdAt)} />
              <Field label="Last updated" value={p.updatedAt ? formatDateTime(p.updatedAt) : null} />
              <Field
                label="Candidate ID"
                mono
                wide
                value={
                  <span className={styles.idRow}>
                    {p.id}
                    <button className={styles.linkBtn} onClick={copyId}>{copied ? "Copied" : "Copy"}</button>
                  </span>
                }
              />
            </dl>
          </Card>

          <Card title="Profile & Experience" icon="🌾">
            <dl className={styles.fieldGrid}>
              <Field label="Eligible role" value={<RoleText role={p.role} />} />
              <Field label="Current role" value={prof.currentRole} />
              <Field
                label="Years of experience"
                value={prof.yearsOfExperience != null ? `${prof.yearsOfExperience} ${prof.yearsOfExperience === 1 ? "year" : "years"}` : null}
              />
              <Field label="Farming background" value={prof.farmingBackground} />
              <Field label="Primary expertise" value={prof.primaryExpertise} />
              <Field label="Crops grown" value={prof.cropsGrown} />
              <Field label="Farm size" value={prof.farmSize} />
              {/* Only when it differs from the eligible role shown above */}
              <Field
                label="Calculated from education & experience"
                value={p.role.calculated && p.role.calculated !== p.role.effective ? p.role.calculated : null}
              />
              <Field label="Recorded role (not a valid role)" value={p.role.storedInvalid} />
            </dl>
            {!hasProfileDetails && <Empty>No profile details recorded yet.</Empty>}
          </Card>
        </div>

        {/* ── Qualifications (directly under Profile & Experience) ── */}
        <Card title="Qualifications" icon="🎓">
          {p.education.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Qualification</th>
                    <th>Discipline</th>
                    <th>Institution</th>
                    <th>Year</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {p.education.map((e, i) => (
                    <tr key={i}>
                      <td>{educationValue(e.level, e.levelOther) || "—"}</td>
                      <td>{educationValue(e.discipline, e.disciplineOther) || "—"}</td>
                      <td>{e.institution || "—"}</td>
                      <td>{e.yearOfCompletion || "—"}</td>
                      <td>
                        {e.status ? <Badge tone={e.status === "Completed" ? "green" : "amber"}>{e.status}</Badge> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !hasLegacyEducation ? (
            <Empty>No education history recorded.</Empty>
          ) : null}

          {showLegacyEducation && (
            <div className={p.education.length > 0 ? styles.legacyBox : undefined}>
              {p.education.length > 0 && <h4 className={styles.subheading}>Earlier profile fields</h4>}
              <dl className={styles.fieldGrid4}>
                <Field label="Highest education" value={legacy.highestEducation} />
                <Field label="Discipline" value={educationValue(legacy.discipline, legacy.disciplineOther)} />
                <Field label="Institution" value={legacy.institution} />
                <Field label="Education status" value={legacy.educationStatus} />
              </dl>
            </div>
          )}
        </Card>

        {/* ── Interview results ── */}
        <Card
          title="Interview Results"
          icon="🎯"
          actions={<span className={styles.muted}>{p.attemptsDone}/{p.maxAttempts} attempts used</span>}
        >
          {p.interviews.length === 0 ? (
            <Empty>No interviews taken yet.</Empty>
          ) : (
            <div className={styles.stack}>
              {p.interviews.map((iv) => {
                const duration = durationLabel(iv.startedAt, iv.completedAt);
                const score = scoreDetails(iv.score, p.role.passThreshold);
                return (
                  <div key={iv.id} className={styles.interview}>
                    <div className={styles.interviewHead}>
                      <div className={styles.interviewTitle}>
                        <strong>{iv.attempt ? `Attempt ${iv.attempt}` : "Session (not counted as an attempt)"}</strong>
                        <span className={styles.interviewResult}>{iv.result || (iv.status ? humanize(iv.status) : "No result")}</span>
                      </div>
                    </div>
                    <dl className={styles.fieldGrid4}>
                      <Info label="Session status" value={iv.status ? humanize(iv.status) : null} />
                      <Info label="Started" value={iv.startedAt ? formatDateTime(iv.startedAt) : null} />
                      <Info label="Completed" value={iv.completedAt ? formatDateTime(iv.completedAt) : null} />
                      <Info label="Duration" value={duration} />
                    </dl>
                    <dl className={styles.fieldGrid4}>
                      <Info label="End reason" value={iv.endReason ? END_REASON_LABELS[iv.endReason] || humanize(iv.endReason) : null} />
                      <Info label="Score obtained" value={score.obtained} />
                      <Info label="Maximum score" value={score.maximum} />
                      <Info label="Pass threshold" value={score.threshold} />
                    </dl>

                    {iv.reEvaluation && (
                      <div className={styles.reEval}>
                        <div className={styles.reEvalHead}>
                          <strong>Re-evaluation</strong>
                          <Badge tone={iv.reEvaluation.status === "pending" ? "amber" : "blue"}>
                            {iv.reEvaluation.status ? humanize(iv.reEvaluation.status) : "Unknown"}
                          </Badge>
                        </div>
                        <dl className={styles.fieldGrid4}>
                          <Field label="Reason" value={iv.reEvaluation.reason} />
                          <Field label="Requested" value={iv.reEvaluation.requestedAt ? formatDateTime(iv.reEvaluation.requestedAt) : null} />
                          <Field label="Completed" value={iv.reEvaluation.completedAt ? formatDateTime(iv.reEvaluation.completedAt) : null} />
                          <Field label="Score after" value={iv.reEvaluation.scoreAfter != null ? `${iv.reEvaluation.scoreAfter}/100` : null} />
                          <Field label="Result after" value={iv.reEvaluation.resultAfter} />
                        </dl>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Candidate progress status (Vibe Foundation Course, Annadathaa Ground Truth module) ── */}
        <Card title="Candidate Progress Status" icon="📈">
          <div className={styles.progressGrid}>
            <ProgressItem
              platform="Vibe"
              name="Foundation Course"
              kind="Course"
              status={progressStatus("foundation", p.foundationCourseCompleted, p.foundationCourseStatus, p.currentPhase, p.documentsSubmitted)}            />
            <ProgressItem
              platform="Annadathaa"
              name="Ground Truth"
              kind="Module"
              status={groundTruthStatus(
                p.moduleCompleted,
                p.moduleStatus,
                p.foundationCourseCompleted,
                p.foundationCourseStatus,
                p.documents.map((d) => d.createdAt),
                p.currentPhase,
                p.documentsSubmitted
              )}
            />
          </div>
        </Card>

        {/* ── Consent & declarations ── */}
        <Card
          title="Consent & Declarations"
          icon="✍️"
          actions={
            <div className={styles.cardActions}>
              {p.consent.status && (
                <Badge tone={p.consent.status === "granted" ? "green" : p.consent.status === "withdrawn" ? "red" : "gray"}>
                  Consent {p.consent.status}
                </Badge>
              )}
              <button className={styles.secondaryBtn} onClick={downloadConsentPdf} disabled={downloading === "consent-pdf"}>
                {downloading === "consent-pdf" ? "Generating…" : "⬇ Download PDF"}
              </button>
            </div>
          }
        >
          <dl className={styles.fieldGrid4}>
            <Field label="All four declarations accepted" value={presentDeclarations.length > 0 ? yesNo(p.declarations.allAccepted) : null} />
            <Field label="Declarations submitted" value={p.declarations.declarationAcceptedAt ? formatDateTime(p.declarations.declarationAcceptedAt) : null} />
            <Field label="Data-access consent recorded" value={p.consent.timestamp ? formatDateTime(p.consent.timestamp) : null} />
            <Field label="Consent withdrawn" value={p.consent.withdrawn ? "Yes" : null} />
            <Field label="Withdrawn at" value={p.consent.withdrawnAt ? formatDateTime(p.consent.withdrawnAt) : null} />
          </dl>
          {p.consent.inferredFromDocuments && (
            <p className={styles.note}>
              Consent status is inferred from the candidate having submitted documents; no explicit consent flag is stored.
            </p>
          )}

          <div className={styles.declarations}>
            {p.declarations.records.map((r, i) => (
              <div key={r.key} className={`${styles.declaration} ${!r.present ? styles.declarationMissing : ""}`}>
                <div className={styles.declarationHead}>
                  <div>
                    <div className={styles.declarationStep}>Declaration {i + 1} of {p.declarations.records.length}</div>
                    <div className={styles.declarationTitle}>{r.consentName || r.label}</div>
                    {r.consentName && r.consentName !== r.label && <div className={styles.muted}>{r.label}</div>}
                  </div>
                  {!r.present ? (
                    <Badge tone="gray">Not recorded</Badge>
                  ) : r.accepted ? (
                    <Badge tone="green">Accepted</Badge>
                  ) : (
                    <Badge tone="red">Not accepted</Badge>
                  )}
                </div>
                {r.present ? (
                  <dl className={styles.declarationRows}>
                    <dt>Signer name</dt>
                    <dd>{r.fullName || "—"}</dd>
                    <dt>Signature</dt>
                    <dd>{r.signature ? <span className={styles.signature}>{r.signature}</span> : "—"}</dd>
                    <dt>Accepted at</dt>
                    <dd>
                      {r.acceptedAt ? (
                        <time dateTime={r.acceptedAt} title={r.acceptedAt}>
                          {formatDateTime(r.acceptedAt)}
                          <span className={styles.rawTime}>{r.acceptedAt}</span>
                        </time>
                      ) : (
                        "—"
                      )}
                    </dd>
                    {Object.entries(r.extra || {}).map(([k, v]) => (
                      <Fragment key={k}>
                        <dt>{humanize(k)}</dt>
                        <dd>{typeof v === "boolean" ? yesNo(v) : String(v)}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : (
                  <p className={styles.empty}>No record of this consent.</p>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* ── Documents (uploaded files only; last card) ── */}
        <Card
          title="Documents"
          icon="📎"
          actions={
            p.documents.length > 0 ? (
              <div className={styles.cardActions}>
                <span className={styles.muted}>
                  {p.documents.length} {p.documents.length === 1 ? "file" : "files"}
                </span>
                <DocumentsZipButton candidate={p} adminFetch={withAuth} onError={setDownloadError} className={styles.secondaryBtn} />
              </div>
            ) : undefined
          }
        >
          {p.documents.length === 0 ? (
            <Empty>No documents uploaded.</Empty>
          ) : (
            <div className={styles.docGrid}>
              {p.documents.map((d) => {
                const key = `doc:${d.id}`;
                return (
                  <div key={d.id} className={styles.docCard}>
                    <div className={styles.docCardHead}>
                      <span className={styles.docCategory}>{documentCategoryLabel(d, p.documents)}</span>
                      <span className={styles.fileTypeTag}>{d.fileType ? d.fileType.toUpperCase() : "FILE"}</span>
                    </div>
                    <span className={styles.fileName}>{d.fileName || "Document"}</span>
                    <span className={styles.muted}>{d.createdAt ? `Uploaded ${formatDateTime(d.createdAt)}` : "Upload time not recorded"}</span>
                    {d.id && (
                      <button
                        className={`${styles.secondaryBtn} ${styles.docDownload}`}
                        disabled={downloading === key}
                        onClick={() =>
                          downloadFile(key, `${base}/document-files/${encodeURIComponent(d.id)}/download`, d.fileName || "document")
                        }
                      >
                        {downloading === key ? "Downloading…" : "⬇ Download"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
