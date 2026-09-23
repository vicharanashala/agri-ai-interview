"use client";

import { useState, useEffect } from "react";
import styles from "./dashboard.module.css";
import { useRouter } from "next/navigation";

import LiveTab from "../../../components/admin/LiveTab";
import EvaluationsTab from "../../../components/admin/EvaluationsTab";
import OfferLetterTab from "../../../components/admin/OfferLetterTab";
import DocumentsTab from "../../../components/admin/DocumentsTab";
import CourseCompletionTab from "../../../components/admin/CourseCompletionTab";
import PageSelector from "../../../components/admin/PageSelector";
import AnalyticsTab from "../../../components/admin/AnalyticsTab";

// Types
interface Candidate {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  state?: string;
  district?: string;
  currentRole?: string;
  yearsOfExperience?: number;
  farmingBackground?: string;
  primaryExpertise?: string;
  currentPhase: string;
  status: string;
  phases: PhaseStatus[];
  attemptsDone: number;
  maxAttempts: number;
  createdAt?: string;
  documentsSubmitted: boolean;
  interviewStatus?: string;
}

interface ParsedResumeData {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: { company: string; title: string; duration: string; highlights: string[] }[];
  education: { institution: string; degree: string; year: string }[];
  summary: string | null;
  confidence_score: number;
}

interface SkillMatchData {
  candidateId: string;
  role: string;
  roleLabel: string;
  overallScore: number;
  requiredMatch: number;
  preferredMatch: number;
  requiredMatched: string[];
  requiredMissing: string[];
  preferredMatched: string[];
  preferredMissing: string[];
  summary: string;
}

interface ResumeInfo {
  id: string;
  candidateId: string;
  fileName: string;
  fileType: string;
  rawText: string | null;
  parsedData: ParsedResumeData | null;
  status: string;
  createdAt: string;
}

interface PhaseStatus {
  phase: string;
  status: string;
  timestamp?: string;
  completedAt?: string;
}

interface ActiveInterview {
  id: string;
  candidateId: string;
  candidateName: string;
  startedAt: string;
  messagesCount: number;
  messages: { role: string; content: string; timestamp: string }[];
  currentPhase: string;
}

interface EvaluationCriteria {
  id: string;
  name: string;
  description?: string;
  weight: number;
  order: number;
  isActive: boolean;
}

interface Guidelines {
  key: string;
  content: string;
  updatedAt?: string;
}

// Tabs
type Tab = "live" | "candidates" | "analytics" | "evaluations" | "course-completion" | "anti-cheat" | "settings" | "documents";
type SettingsTab = "guidelines" | "criteria" | "interview-config" | "anti-cheat" | "offer-letter";

// Chart colors
const CHART_COLORS = ["#08CB00", "#10b981", "#f59e0b", "#ef4444", "#059669", "#22c55e"];

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  interview: "Interview",
  summary: "Summary",
  foundation: "Foundation Course",
  documents: "Documents",
};

// Points to the Next.js rewrite proxy so the browser talks to a single origin.
// In Docker, this resolves to the Next.js server; locally it falls back to the
// direct backend URL for development outside Docker.
const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

export default function AdminDashboard() {
  const router = useRouter();

  // Get the stored admin token (set by the login page).
   // Send it as X-Admin-Token on every admin API call.
  // This works for all deployment types: local, same-origin, cross-origin.
  const getAdminToken = () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("admin_token");
  };

  const withAuth = (url: string, opts: RequestInit = {}) => {
    const token = getAdminToken();
    const headers = {
      ...(token ? { "X-Admin-Token": token } : {}),
      ...((opts.headers as Record<string, string>) || {}),
    };
    return fetch(`${ADMIN_API_BASE}${url}`, {
      ...opts,
      headers,
      credentials: "include",
    });
  };

  const [activeTab, setActiveTab] = useState<Tab>("live");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("guidelines");
  const [adminData, setAdminData] = useState<{ name: string; email: string } | null>(null);

  // Data states
  const [activeInterviews, setActiveInterviews] = useState<ActiveInterview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [guidelines, setGuidelines] = useState<Guidelines[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriteria[]>([]);

  // UI states
  const [selectedInterview, setSelectedInterview] = useState<string | null>(null);
  const [resumeModal, setResumeModal] = useState<{ open: boolean; resume: ResumeInfo | null }>({ open: false, resume: null });
  const [candidateResumes, setCandidateResumes] = useState<Record<string, ResumeInfo>>({}); // candidateId → latest resume
  const [matchModal, setMatchModal] = useState<{ open: boolean; candidateId: string; candidateName: string; role: string }>({ open: false, candidateId: "", candidateName: "", role: "" });
  const [matchData, setMatchData] = useState<SkillMatchData | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingGuideline, setEditingGuideline] = useState<string | null>(null);
  const [guidelineContent, setGuidelineContent] = useState("");
  const [editingCriteria, setEditingCriteria] = useState<string | null>(null);
  const [criteriaForm, setCriteriaForm] = useState<Partial<EvaluationCriteria>>({});
  type LevelConfig = { max_questions: number; max_duration_minutes: number; pass_threshold: number; cooldown_days: number; };
  type Levels = { YP: LevelConfig; Junior: LevelConfig; Agri: LevelConfig; Senior: LevelConfig; };
  const DEFAULT_LEVEL: LevelConfig = { max_questions: 10, max_duration_minutes: 30, pass_threshold: 60, cooldown_days: 0 };

  const [interviewConfig, setInterviewConfig] = useState<{ max_concurrent_interviews: number; levels: Levels }>({
    max_concurrent_interviews: 20,
    levels: { YP: { ...DEFAULT_LEVEL }, Junior: { ...DEFAULT_LEVEL }, Agri: { ...DEFAULT_LEVEL }, Senior: { ...DEFAULT_LEVEL } }
  });

  const [levelInputs, setLevelInputs] = useState<Levels>({
    YP: { ...DEFAULT_LEVEL }, Junior: { ...DEFAULT_LEVEL }, Agri: { ...DEFAULT_LEVEL }, Senior: { ...DEFAULT_LEVEL }
  });
  
  const [maxConcurrentInput, setMaxConcurrentInput] = useState<number>(20);
  const [savingConfig, setSavingConfig] = useState(false);
  const [antiCheatConfig, setAntiCheatConfig] = useState<{ idle_threshold_ms: number; platform_idle_ms: number }>({ idle_threshold_ms: 15_000, platform_idle_ms: 15 * 60_000 });
  const [idleThresholdInput, setIdleThresholdInput] = useState<number>(15);
  const [platformIdleInput, setPlatformIdleInput] = useState<number>(15);
  const [savingAntiCheat, setSavingAntiCheat] = useState(false);
  const [stats, setStats] = useState({ 
    totalCandidates: 0, 
    activeInterviews: 0, 
    completedInterviews: 0,
    phaseDistribution: {},
    statusDistribution: {}
  });
  
  const [geoStats, setGeoStats] = useState<any>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(false);
  const [uniqueStates, setUniqueStates] = useState<string[]>([]);
  const [stateFunnel, setStateFunnel] = useState<{states: any[]; totalStates: number} | null>(null);
  const [stateFunnelFilter, setStateFunnelFilter] = useState<string>("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [interviewStatusFilter, setInterviewStatusFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [districts, setDistricts] = useState<string[]>([]);

  // Check auth on mount — verify the admin_session cookie with the backend
  useEffect(() => {
    const verifyAndLoad = async () => {
      try {
        const res = await withAuth("/api/admin/auth/session");
        if (!res.ok) {
          router.push("/admin/login");
          return;
        }
        const session = await res.json();
        setAdminData({ name: "Admin User", email: session.email });
        loadData();
        // Wipe stale live-interview cache so the UI never shows outdated sessions
        setActiveInterviews([]);
      } catch {
        router.push("/admin/login");
      }
    };
    verifyAndLoad();
  }, [router]);

  // Poll for live updates
  useEffect(() => {
    if (activeTab === "live") {
      const interval = setInterval(loadActiveInterviews, 5000);
      return () => clearInterval(interval);
    }
    if (activeTab === "anti-cheat") {
      const interval = setInterval(loadViolations, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Reload state funnel when filter changes
  useEffect(() => {
    loadStateFunnel();
  }, [stateFunnelFilter]);

  // Reload data when tab changes
  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);



  const loadData = async (tab?: Tab) => {
    const target = tab ?? activeTab;
    setLoading(true);
    try {
      const calls: Promise<void>[] = [];
      if (target === "live") {
        calls.push(
          loadStats().catch(err => console.error("loadStats error:", err)),
          loadActiveInterviews().catch(err => console.error("loadActiveInterviews error:", err)),
        );
      } else if (target === "candidates") {
        calls.push(
          loadStats().catch(err => console.error("loadStats error:", err)),
          loadCandidates().catch(err => console.error("loadCandidates error:", err)),
        );
      } else if (target === "analytics") {
        calls.push(
          loadStats().catch(err => console.error("loadStats error:", err)),
          loadGeoStats().catch(err => console.error("loadGeoStats error:", err)),
          loadStateFunnel().catch(err => console.error("loadStateFunnel error:", err)),
        );
      } else if (target === "evaluations") {
        calls.push(
          loadStats().catch(err => console.error("loadStats error:", err)),
        );
      } else if (target === "course-completion") {
        calls.push(
          loadStats().catch(err => console.error("loadStats error:", err)),
          loadCandidates().catch(err => console.error("loadCandidates error:", err)),
        );
      } else if (target === "anti-cheat") {
        calls.push(
          loadStats().catch(err => console.error("loadStats error:", err)),
          loadViolations().catch(err => console.error("loadViolations error:", err)),
        );
      } else if (target === "documents") {
        calls.push(
          loadStats().catch(err => console.error("loadStats error:", err)),
        );
      } else if (target === "settings") {
        calls.push(
          loadGuidelines().catch(err => console.error("loadGuidelines error:", err)),
          loadCriteria().catch(err => console.error("loadCriteria error:", err)),
          loadInterviewConfig().catch(err => console.error("loadInterviewConfig error:", err)),
          loadAntiCheatConfig().catch(err => console.error("loadAntiCheatConfig error:", err)),
        );
      }
      await Promise.all(calls);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await withAuth("/api/admin/stats/overview");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const loadActiveInterviews = async () => {
    try {
      const res = await withAuth("/api/admin/interviews/active");
      if (res.ok) {
        const data = await res.json();
        setActiveInterviews(data.interviews || []);
      }
    } catch (err) {
      console.error("Failed to load active interviews:", err);
    }
  };

  const [candidatesTotal, setCandidatesTotal] = useState(0);
  const [candidatesPage, setCandidatesPage] = useState(0);
  const [candidatesLimit, setCandidatesLimit] = useState(10);

  const loadCandidates = async (resetPage = false) => {
    try {
      const currentPage = resetPage ? 0 : candidatesPage;
      if (resetPage) setCandidatesPage(0);

      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (phaseFilter) params.append("phase", phaseFilter);
      if (stateFilter) params.append("state", stateFilter);
      if (districtFilter) params.append("district", districtFilter);
      if (interviewStatusFilter) params.append("interviewStatus", interviewStatusFilter);
      params.append("limit", candidatesLimit.toString());
      params.append("offset", (currentPage * candidatesLimit).toString());

      const res = await withAuth(`/api/admin/candidates?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
        setCandidatesTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load candidates:", err);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    if (activeTab === "candidates") {
      loadCandidates(true);
    }
  }, [phaseFilter, stateFilter, districtFilter, interviewStatusFilter, searchQuery, candidatesLimit]);

  useEffect(() => {
    if (activeTab === "candidates") {
      loadCandidates(false);
    }
  }, [candidatesPage]);

  // ── Resume helpers ──────────────────────────────────────────────────────────

  const loadResumeForCandidate = async (candidateId: string) => {
    try {
      const res = await withAuth(`/api/admin/resumes?candidateId=${candidateId}`);
      if (res.ok) {
        const data: ResumeInfo[] = await res.json();
        if (data.length > 0) {
          setCandidateResumes(prev => ({ ...prev, [candidateId]: data[0] }));
        }
      }
    } catch (err) {
      console.error("Failed to load resume for candidate:", err);
    }
  };

  const loadResumesForAllCandidates = async (candidateList: Candidate[]) => {
    // Load resumes for all candidates in parallel
    await Promise.allSettled(candidateList.map(c => loadResumeForCandidate(c.id)));
  };

  const handleDownloadResume = (resume: ResumeInfo) => {
    window.open(`/api/resume/${resume.id}`, "_blank");
  };

  const handlePreviewResume = (resume: ResumeInfo) => {
    setResumeModal({ open: true, resume });
  };

  // ── Skills Match helpers ───────────────────────────────────────────────────

  const ROLE_OPTIONS = [
    { value: "frontend_engineer", label: "Frontend Engineer" },
    { value: "backend_engineer", label: "Backend Engineer" },
    { value: "fullstack_engineer", label: "Full Stack Engineer" },
    { value: "devops_engineer", label: "DevOps Engineer" },
    { value: "ai_ml_engineer", label: "AI/ML Engineer" },
    { value: "mobile_engineer", label: "Mobile Engineer" },
  ];

  const fetchSkillMatch = async (candidateId: string, candidateName: string, role: string) => {
    setMatchModal({ open: true, candidateId, candidateName, role });
    setMatchData(null);
    setMatchLoading(true);
    try {
      const res = await withAuth(`/api/admin/resume/match?candidateId=${candidateId}&role=${role}`);
      if (res.ok) {
        const data: SkillMatchData = await res.json();
        setMatchData(data);
      } else {
        setMatchData(null);
      }
    } catch {
      setMatchData(null);
    } finally {
      setMatchLoading(false);
    }
  };

  // ── Parsed Resume View Component ──────────────────────────────────────────

  function ParsedResumeView({ data }: { data: ParsedResumeData }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "65vh", overflow: "auto" }}>
        {/* Contact + Summary */}
        <div style={{ background: "#f0f4ff", borderRadius: "6px", padding: "12px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
            👤 {data.name || "Name not detected"}
          </div>
          <div style={{ fontSize: "13px", color: "#555" }}>
            {data.email && `📧 ${data.email}`}
            {data.phone && ` · 📞 ${data.phone}`}
          </div>
          {data.summary && (
            <div style={{ marginTop: "8px", fontSize: "13px", color: "#333", fontStyle: "italic" }}>
              "{data.summary}"
            </div>
          )}
        </div>

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "6px", color: "#333" }}>
              🛠 Skills ({data.skills.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {data.skills.map((skill, i) => (
                <span
                  key={i}
                  style={{
                    background: "#dbeafe",
                    color: "#1e40af",
                    borderRadius: "4px",
                    padding: "2px 8px",
                    fontSize: "12px",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Experience */}
        {data.experience.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "6px", color: "#333" }}>
              💼 Experience
            </div>
            {data.experience.map((exp, i) => (
              <div
                key={i}
                style={{ background: "#f9f9f9", borderRadius: "6px", padding: "10px 14px", marginBottom: "8px" }}
              >
                <div style={{ fontWeight: 600, fontSize: "13px" }}>{exp.title}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {exp.company}
                  {exp.duration && ` · ${exp.duration}`}
                </div>
                {exp.highlights.length > 0 && (
                  <ul style={{ margin: "6px 0 0 0", paddingLeft: "18px", fontSize: "12px", color: "#444" }}>
                    {exp.highlights.map((h, j) => (
                      <li key={j}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "6px", color: "#333" }}>
              🎓 Education
            </div>
            {data.education.map((edu, i) => (
              <div
                key={i}
                style={{ background: "#f9f9f9", borderRadius: "6px", padding: "8px 14px", marginBottom: "6px" }}
              >
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{edu.degree}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {edu.institution}
                  {edu.year && ` · ${edu.year}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Load resumes when candidates tab is active
  useEffect(() => {
    if (activeTab === "candidates" && candidates.length > 0) {
      loadResumesForAllCandidates(candidates);
    }
  }, [activeTab, candidates]);

  const [violationsTotal, setViolationsTotal] = useState(0);
  const [violationsPage, setViolationsPage] = useState(0);
  const [violationsLimit, setViolationsLimit] = useState(10);

  const loadViolations = async () => {
    setViolationsLoading(true);
    try {
      const offset = violationsPage * violationsLimit;
      const res = await withAuth(`/api/admin/anti-cheat/violations?limit=${violationsLimit}&offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        setViolations(data.violations || []);
        setViolationsTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load violations:", err);
    } finally {
      setViolationsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "anti-cheat") {
      loadViolations();
    }
  }, [violationsPage, violationsLimit]);

  const loadStateFunnel = async () => {
    try {
      const path = stateFunnelFilter
        ? `/api/admin/stats/states?state=${encodeURIComponent(stateFunnelFilter)}`
        : "/api/admin/stats/states";
      const res = await withAuth(path);
      if (res.ok) {
        const data = await res.json();
        setStateFunnel(stateFunnelFilter ? { states: [data], totalStates: 1 } : data);
      }
    } catch (err) {
      console.error("Failed to load state funnel:", err);
    }
  };

  const loadGeoStats = async () => {
    try {
      const res = await withAuth("/api/admin/geo/stats");
      if (res.ok) {
        const data = await res.json();
        setGeoStats(data);
        setUniqueStates(data.uniqueStates || []);
      }
    } catch (err) {
      console.error("Failed to load geographic stats:", err);
    }
  };

  const loadDistrictsForState = async (state: string) => {
    if (!state) {
      setDistricts([]);
      return;
    }
    try {
      const res = await withAuth(`/api/admin/stats/locations?state=${encodeURIComponent(state)}`);
      if (res.ok) {
        const data = await res.json();
        setDistricts(data.districts || []);
      }
    } catch (err) {
      console.error("Failed to load districts:", err);
    }
  };

  const handleStateChange = (state: string) => {
    setStateFilter(state);
    setDistrictFilter("");
    setDistricts([]);
    if (state) {
      loadDistrictsForState(state);
    }
  };

  const loadGuidelines = async () => {
    try {
      const res = await withAuth("/api/admin/settings/guidelines");
      if (res.ok) {
        const data = await res.json();
        setGuidelines(data.guidelines || []);
      }
    } catch (err) {
      console.error("Failed to load guidelines:", err);
    }
  };

  const loadCriteria = async () => {
    try {
      const res = await withAuth("/api/admin/settings/evaluation");
      if (res.ok) {
        const data = await res.json();
        setCriteria(data.criteria || []);
      }
    } catch (err) {
      console.error("Failed to load criteria:", err);
    }
  };

  const loadInterviewConfig = async () => {
    try {
      const res = await withAuth("/api/admin/settings/interview");
      if (res.ok) {
        const data = await res.json();
        const baseLevel = {
          max_questions: data.max_questions ?? 10,
          max_duration_minutes: data.max_duration_minutes ?? 30,
          pass_threshold: data.pass_threshold ?? 60,
          cooldown_days: data.cooldown_days ?? 0
        };
        const levels = data.levels || {
          YP: { ...baseLevel },
          Junior: { ...baseLevel },
          Agri: { ...baseLevel },
          Senior: { ...baseLevel }
        };
        setInterviewConfig({ 
          max_concurrent_interviews: data.max_concurrent_interviews ?? 20,
          levels 
        });
        setMaxConcurrentInput(data.max_concurrent_interviews ?? 20);
        setLevelInputs(levels);
      }
    } catch (err) {
      console.error("Failed to load interview config:", err);
    }
  };

  const loadAntiCheatConfig = async () => {
    try {
      const res = await withAuth("/api/admin/settings/anti-cheat");
      if (res.ok) {
        const data = await res.json();
        setAntiCheatConfig(data);
        setIdleThresholdInput(Math.round((data.idle_threshold_ms ?? 15000) / 1000));
        setPlatformIdleInput(Math.round((data.platform_idle_ms ?? 900000) / 60000));
      }
    } catch (err) {
      console.error("Failed to load anti-cheat config:", err);
    }
  };

  const handleSaveAntiCheatConfig = async () => {
    setSavingAntiCheat(true);
    try {
      const res = await withAuth("/api/admin/settings/anti-cheat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idle_threshold_ms: idleThresholdInput * 1000,
          platform_idle_ms: platformIdleInput * 60000,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAntiCheatConfig(data);
        setIdleThresholdInput(Math.round((data.idle_threshold_ms ?? 15000) / 1000));
        setPlatformIdleInput(Math.round((data.platform_idle_ms ?? 900000) / 60000));
      }
    } catch (err) {
      console.error("Failed to save anti-cheat config:", err);
    } finally {
      setSavingAntiCheat(false);
    }
  };

  const handleSaveInterviewConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await withAuth("/api/admin/settings/interview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_concurrent_interviews: maxConcurrentInput,
          levels: levelInputs
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const baseLevel = {
          max_questions: data.max_questions ?? 10,
          max_duration_minutes: data.max_duration_minutes ?? 30,
          pass_threshold: data.pass_threshold ?? 60,
          cooldown_days: data.cooldown_days ?? 0
        };
        const levels = data.levels || {
          YP: { ...baseLevel },
          Junior: { ...baseLevel },
          Agri: { ...baseLevel },
          Senior: { ...baseLevel }
        };
        setInterviewConfig({ 
          max_concurrent_interviews: data.max_concurrent_interviews ?? 20,
          levels 
        });
        setMaxConcurrentInput(data.max_concurrent_interviews ?? 20);
        setLevelInputs(levels);
      }
    } catch (err) {
      console.error("Failed to save interview config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleLogout = async () => {
    try {
      await withAuth("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Best-effort: still redirect even if the call fails
    }
    router.push("/admin/login");
  };

  const handleSaveGuideline = async (key: string) => {
    try {
      const res = await withAuth(`/api/admin/settings/guidelines/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: guidelineContent }),
      });
      if (res.ok) {
        setEditingGuideline(null);
        loadGuidelines();
      }
    } catch (err) {
      console.error("Failed to save guideline:", err);
    }
  };

  const handleSaveCriteria = async (id: string) => {
    try {
      const res = await withAuth(`/api/admin/settings/evaluation/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(criteriaForm),
      });
      if (res.ok) {
        setEditingCriteria(null);
        loadCriteria();
      }
    } catch (err) {
      console.error("Failed to save criteria:", err);
    }
  };

  const handleDeleteCriteria = async (id: string) => {
    if (!confirm("Are you sure you want to delete this criteria?")) return;
    try {
      const res = await withAuth(`/api/admin/settings/evaluation/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadCriteria();
      }
    } catch (err) {
      console.error("Failed to delete criteria:", err);
    }
  };

  const selectedInterviewData = activeInterviews.find((i) => i.id === selectedInterview);



  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }
  const handleExportCsv = () => {
    if (candidates.length === 0) return;
    const headers = ["Name", "Email", "Phone", "State", "Current Phase", "Interview Status", "Attempts", "Created At"];
    const csvRows = [headers.join(",")];
    for (const c of candidates) {
      csvRows.push([
        `"${c.fullName || ""}"`,
        `"${c.email || ""}"`,
        `"${c.phone || ""}"`,
        `"${c.state || ""}"`,
        `"${PHASE_LABELS[c.currentPhase] || c.currentPhase}"`,
        `"${c.interviewStatus || "not_attended"}"`,
        c.attemptsDone,
        `"${c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : ""}"`
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `candidates_${phaseFilter || "all"}_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.logo}>Admin Dashboard</h1>
          <span className={styles.adminName}>Welcome, {adminData?.name || "Admin"}</span>
        </div>
        <div className={styles.headerRight}>
          <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
        </div>
      </header>



      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "live" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("live")}
        >
          🔴 Live Interviews ({activeInterviews.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "candidates" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("candidates")}
        >
          👥 All Candidates ({candidatesTotal})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "analytics" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          📊 Analytics
        </button>
        <button
          className={`${styles.tab} ${activeTab === "evaluations" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("evaluations")}
        >
          📋 Evaluations
        </button>
        <button
          className={`${styles.tab} ${activeTab === "course-completion" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("course-completion")}
        >
          🎓 Course Completion
        </button>
        <button
          className={`${styles.tab} ${activeTab === "anti-cheat" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("anti-cheat")}
        >
          🛡️ Anti-Cheat
        </button>
        <button
          className={`${styles.tab} ${activeTab === "documents" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          📎 Documents
        </button>
        <button
          className={`${styles.tab} ${activeTab === "settings" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          ⚙️ Settings
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Live Interviews Tab */}
        {activeTab === "live" && (
          <LiveTab
            interviews={activeInterviews}
            selectedId={selectedInterview}
            onSelect={setSelectedInterview}
          />
        )}

        {/* Candidates Tab */}
        {activeTab === "candidates" && (
          <div className={styles.candidatesContainer}>
            {/* Filters */}
            <div className={styles.filters}>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadCandidates()}
                className={styles.searchInput}
              />
              <select
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                className={styles.phaseSelect}
              >
                <option value="">All Phases</option>
                {Object.entries(PHASE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                value={stateFilter}
                onChange={(e) => handleStateChange(e.target.value)}
                className={styles.phaseSelect}
              >
                <option value="">All States</option>
                {uniqueStates.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              {stateFilter && (
                <select
                  value={districtFilter}
                  onChange={(e) => setDistrictFilter(e.target.value)}
                  className={styles.phaseSelect}
                >
                  <option value="">All Districts</option>
                  {districts.map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              )}
              <select
                value={interviewStatusFilter}
                onChange={(e) => setInterviewStatusFilter(e.target.value)}
                className={styles.phaseSelect}
              >
                <option value="">All Interview Statuses</option>
                <option value="not_attended">Not Attended (NIL)</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="requested_revaluation">Requested Revaluation</option>
              </select>
              <button onClick={() => loadCandidates(true)} className={styles.searchBtn}>Search</button>
              <button onClick={handleExportCsv} className={styles.exportBtn} style={{ marginLeft: "auto", background: "#10b981", color: "white", padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Export CSV
              </button>
            </div>

            {/* Candidates Table */}
            {candidates.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No candidates found</p>
              </div>
            ) : (
              <>
                <div className={styles.candidatesTable}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>State</th>
                        <th>Current Phase</th>
                        <th>Phase Progress</th>
                        <th>Attempts</th>
                        <th>Resume</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((candidate) => (
                        <tr key={candidate.id}>
                          <td>{candidate.fullName || "-"}</td>
                          <td>{candidate.email || "-"}</td>
                          <td>{candidate.phone || "-"}</td>
                          <td>{candidate.state || "-"}</td>
                          <td>
                            <span className={styles.phaseBadge}>
                              {PHASE_LABELS[candidate.currentPhase] || candidate.currentPhase}
                            </span>
                          </td>
                          <td>
                            <div className={styles.phaseProgress}>
                              {(candidate.phases || []).map((p, idx) => (
                                <div
                                  key={idx}
                                  className={`${styles.phaseDot} ${
                                    p.status === "completed" ? styles.phaseCompleted :
                                    p.status === "in_progress" ? styles.phaseActive : ""
                                  }`}
                                  title={`${PHASE_LABELS[p.phase] || p.phase}: ${p.status}`}
                                />
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className={styles.phaseBadge}>
                              {candidate.attemptsDone}/{candidate.maxAttempts}
                            </span>
                          </td>
                          <td>
                            {candidateResumes[candidate.id] ? (
                              <div style={{ display: "flex", gap: "4px" }}>
                                <button
                                  onClick={() => handlePreviewResume(candidateResumes[candidate.id]!)}
                                  style={{ padding: "2px 8px", fontSize: "12px", cursor: "pointer" }}
                                  title="Preview resume"
                                >
                                  👁 Preview
                                </button>
                                <button
                                  onClick={() => candidateResumes[candidate.id]?.parsedData
                                    ? setMatchModal({ open: true, candidateId: candidate.id, candidateName: candidate.fullName || candidate.email || "", role: "frontend_engineer" })
                                    : null
                                  }
                                  style={{ padding: "2px 8px", fontSize: "12px", cursor: candidateResumes[candidate.id]?.parsedData ? "pointer" : "not-allowed", opacity: candidateResumes[candidate.id]?.parsedData ? 1 : 0.4 }}
                                  title={candidateResumes[candidate.id]?.parsedData ? "Match skills to a role" : "Resume not yet parsed"}
                                >
                                  🔗 Match
                                </button>
                                <button
                                  onClick={() => handleDownloadResume(candidateResumes[candidate.id]!)}
                                  style={{ padding: "2px 8px", fontSize: "12px", cursor: "pointer" }}
                                  title="Download resume"
                                >
                                  ⬇ Download
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: "#999", fontSize: "12px" }}>—</span>
                            )}
                          </td>
                          <td>{candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PageSelector
                  total={candidatesTotal}
                  page={candidatesPage}
                  limit={candidatesLimit}
                  onPageChange={setCandidatesPage}
                  onLimitChange={setCandidatesLimit}
                  loading={loading}
                />
              </>
            )}
          </div>
        )}

        {/* ── Resume Preview Modal ── */}
        {resumeModal.open && resumeModal.resume && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setResumeModal({ open: false, resume: null })}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "8px",
                padding: "24px",
                width: "700px",
                maxWidth: "90vw",
                maxHeight: "85vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0, fontSize: "16px" }}>
                  📄 {resumeModal.resume.fileName}
                </h2>
                <button
                  onClick={() => setResumeModal({ open: false, resume: null })}
                  style={{ padding: "4px 10px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
              {resumeModal.resume.parsedData ? (
                <ParsedResumeView data={resumeModal.resume.parsedData!} />
              ) : (
                <div
                  style={{
                    background: "#f5f5f5",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    padding: "16px",
                    fontSize: "13px",
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    maxHeight: "60vh",
                    overflow: "auto",
                  }}
                >
                  {resumeModal.resume.rawText
                    ? resumeModal.resume.rawText
                    : "No text extracted (file may be image-based or empty)."}
                </div>
              )}
              <div style={{ marginTop: "12px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <span style={{ fontSize: "12px", color: "#666", alignSelf: "center" }}>
                  {resumeModal.resume.status === "parsed"
                    ? `✅ Parsed (confidence: ${((resumeModal.resume.parsedData?.confidence_score ?? 0) * 100).toFixed(0)}%)`
                    : resumeModal.resume.status === "parsing"
                    ? "⏳ Parsing..."
                    : resumeModal.resume.status === "uploaded"
                    ? "📋 Uploaded — LLM parsing in progress"
                    : resumeModal.resume.status
                  }
                </span>
                <button
                  onClick={() => handleDownloadResume(resumeModal.resume!)}
                  style={{ padding: "6px 16px", cursor: "pointer" }}
                >
                  ⬇ Download Original
                </button>
                <button
                  onClick={() => setResumeModal({ open: false, resume: null })}
                  style={{ padding: "6px 16px", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Skills Match Modal ── */}
        {matchModal.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
            }}
            onClick={() => { setMatchModal(m => ({ ...m, open: false })); setMatchData(null); }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "10px",
                padding: "24px",
                width: "680px",
                maxWidth: "90vw",
                maxHeight: "85vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "18px" }}>🔗 Skills Match</h2>
                  <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#666" }}>{matchModal.candidateName}</p>
                </div>
                <button
                  onClick={() => { setMatchModal(m => ({ ...m, open: false })); setMatchData(null); }}
                  style={{ padding: "4px 10px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {/* Role selector */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px", display: "block" }}>
                  Target Role
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    value={matchModal.role}
                    onChange={(e) => fetchSkillMatch(matchModal.candidateId, matchModal.candidateName, e.target.value)}
                    style={{ flex: 1, padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid #ccc" }}
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => fetchSkillMatch(matchModal.candidateId, matchModal.candidateName, matchModal.role)}
                    style={{ padding: "6px 16px", cursor: "pointer", fontSize: "13px" }}
                  >
                    Check
                  </button>
                </div>
              </div>

              {matchLoading && <p style={{ textAlign: "center", color: "#666" }}>⏳ Analysing skills...</p>}

              {matchData && (
                <div>
                  {/* Score badges */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                    {[
                      { label: "Overall", value: matchData.overallScore, color: "#1e40af" },
                      { label: "Required", value: matchData.requiredMatch, color: "#b45309" },
                      { label: "Preferred", value: matchData.preferredMatch, color: "#065f46" },
                    ].map(b => (
                      <div key={b.label} style={{ flex: 1, background: "#f8fafc", borderRadius: "8px", padding: "10px", textAlign: "center", border: `2px solid ${b.color}` }}>
                        <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px" }}>{b.label}</div>
                        <div style={{ fontSize: "22px", fontWeight: 700, color: b.color }}>
                          {(b.value * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>

                  <p style={{ fontSize: "13px", color: "#444", fontStyle: "italic", marginBottom: "16px" }}>
                    "{matchData.summary}"
                  </p>

                  {/* Required skills */}
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#92400e", marginBottom: "6px" }}>
                      ⚠️ Required Skills ({matchData.requiredMatched.length}/{matchData.requiredMatched.length + matchData.requiredMissing.length} matched)
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {matchData.requiredMatched.map(s => (
                        <span key={s} style={{ background: "#dcfce7", color: "#166534", borderRadius: "4px", padding: "2px 8px", fontSize: "12px" }}>{s}</span>
                      ))}
                      {matchData.requiredMissing.map(s => (
                        <span key={s} style={{ background: "#fee2e2", color: "#991b1b", borderRadius: "4px", padding: "2px 8px", fontSize: "12px" }}>{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* Preferred skills */}
                  {matchData.preferredMatched.length > 0 || matchData.preferredMissing.length > 0 ? (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#065f46", marginBottom: "6px" }}>
                        👍 Preferred Skills ({matchData.preferredMatched.length}/{matchData.preferredMatched.length + matchData.preferredMissing.length} matched)
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {matchData.preferredMatched.map(s => (
                          <span key={s} style={{ background: "#dcfce7", color: "#166534", borderRadius: "4px", padding: "2px 8px", fontSize: "12px" }}>{s}</span>
                        ))}
                        {matchData.preferredMissing.map(s => (
                          <span key={s} style={{ background: "#fef9c3", color: "#854d0e", borderRadius: "4px", padding: "2px 8px", fontSize: "12px" }}>{s}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <AnalyticsTab
            adminApiBase={ADMIN_API_BASE}
            getAdminToken={getAdminToken}
          />
        )}

        {/* Evaluations Tab */}
        {activeTab === "evaluations" && (
          <EvaluationsTab
            adminApiBase={ADMIN_API_BASE}
            getAdminToken={getAdminToken}
            onCandidateClick={(query) => {
              setSearchQuery(query);
              setActiveTab("candidates");
            }}
          />
        )}

        {/* Course Completion Tab */}
        {activeTab === "course-completion" && (
          <CourseCompletionTab
            adminToken={getAdminToken()}
            adminApiBase={ADMIN_API_BASE}
            onRefreshCandidates={loadCandidates}
          />
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <DocumentsTab adminToken={getAdminToken()} />
        )}

        {/* Anti-Cheat Tab */}
        {activeTab === "anti-cheat" && (
          <div className={styles.antiCheatContainer}>
            <h2 className={styles.antiCheatTitle}>🛡️ Anti-Cheat Violations</h2>
            {violationsLoading && violations.length === 0 ? (
              <p>Loading...</p>
            ) : violations.length === 0 ? (
              <p className={styles.noDataMessage}>No violations recorded yet.</p>
            ) : (
              <>
                <div className={styles.violationsTable}>
                  <table>
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Email</th>
                        <th>Violation</th>
                        <th>Severity</th>
                        <th>Auto-Closed</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {violations.map((v: any) => (
                        <tr key={v.id}>
                          <td>{v.candidateName}</td>
                          <td>{v.email}</td>
                          <td>
                            <span className={styles.violationBadge}>
                              {v.eventType.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td>
                            <span className={v.severity === "critical" ? styles.severityCritical : styles.severityWarning}>
                              {v.severity}
                            </span>
                          </td>
                          <td>
                            <span className={v.autoClosed ? styles.autoClosedYes : styles.autoClosedNo}>
                              {v.autoClosed ? "🔴 Yes" : "—"}
                            </span>
                          </td>
                          <td>{v.createdAt ? new Date(v.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PageSelector
                  total={violationsTotal}
                  page={violationsPage}
                  limit={violationsLimit}
                  onPageChange={setViolationsPage}
                  onLimitChange={setViolationsLimit}
                  loading={violationsLoading}
                />
              </>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className={styles.settingsContainer}>
            <div className={styles.settingsTabs}>
              <button
                className={`${styles.settingsTab} ${settingsTab === "guidelines" ? styles.activeSettingsTab : ""}`}
                onClick={() => setSettingsTab("guidelines")}
              >
                LLM Guidelines
              </button>
              <button
                className={`${styles.settingsTab} ${settingsTab === "criteria" ? styles.activeSettingsTab : ""}`}
                onClick={() => setSettingsTab("criteria")}
              >
                Evaluation Criteria
              </button>
              <button
                className={`${styles.settingsTab} ${settingsTab === "interview-config" ? styles.activeSettingsTab : ""}`}
                onClick={() => setSettingsTab("interview-config")}
              >
                Interview Config
              </button>
              <button
                className={`${styles.settingsTab} ${settingsTab === "anti-cheat" ? styles.activeSettingsTab : ""}`}
                onClick={() => setSettingsTab("anti-cheat")}
              >
                Anti-Cheat
              </button>
              <button
                className={`${styles.settingsTab} ${settingsTab === "offer-letter" ? styles.activeSettingsTab : ""}`}
                onClick={() => setSettingsTab("offer-letter")}
              >
                Offer Letter
              </button>
            </div>

            {/* Guidelines Section */}
            {settingsTab === "guidelines" && (
              <div className={styles.guidelinesSection}>
                <p className={styles.settingsDescription}>
                  Modify the guidelines used by the LLM for generating interview questions and responses.
                </p>
                {guidelines.map((g) => (
                  <div key={g.key} className={styles.guidelineCard}>
                    <div className={styles.guidelineHeader}>
                      <h3>{g.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</h3>
                      <button
                        onClick={() => {
                          if (editingGuideline === g.key) {
                            setEditingGuideline(null);
                          } else {
                            setEditingGuideline(g.key);
                            setGuidelineContent(g.content);
                          }
                        }}
                        className={styles.editBtn}
                      >
                        {editingGuideline === g.key ? "Cancel" : "Edit"}
                      </button>
                    </div>
                    {editingGuideline === g.key ? (
                      <div className={styles.guidelineEditor}>
                        <textarea
                          value={guidelineContent}
                          onChange={(e) => setGuidelineContent(e.target.value)}
                          className={styles.guidelineTextarea}
                          rows={15}
                        />
                        <button onClick={() => handleSaveGuideline(g.key)} className={styles.saveBtn}>
                          Save Changes
                        </button>
                      </div>
                    ) : (
                      <pre className={styles.guidelineContent}>{g.content}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Evaluation Criteria Section */}
            {settingsTab === "criteria" && (
              <div className={styles.criteriaSection}>
                <p className={styles.settingsDescription}>
                  Manage the evaluation criteria and their weights for interview scoring.
                </p>
                {criteria.map((c) => (
                  <div key={c.id} className={styles.criteriaCard}>
                    {editingCriteria === c.id ? (
                      <div className={styles.criteriaEditor}>
                        <input
                          type="text"
                          value={criteriaForm.name || ""}
                          onChange={(e) => setCriteriaForm({ ...criteriaForm, name: e.target.value })}
                          placeholder="Name"
                          className={styles.criteriaInput}
                        />
                        <textarea
                          value={criteriaForm.description || ""}
                          onChange={(e) => setCriteriaForm({ ...criteriaForm, description: e.target.value })}
                          placeholder="Description"
                          className={styles.criteriaTextarea}
                          rows={2}
                        />
                        <div className={styles.criteriaRow}>
                          <input
                            type="number"
                            value={criteriaForm.weight || 0}
                            onChange={(e) => setCriteriaForm({ ...criteriaForm, weight: Number(e.target.value) })}
                            placeholder="Weight"
                            className={styles.criteriaInput}
                          />
                          <select
                            value={criteriaForm.isActive ? "true" : "false"}
                            onChange={(e) => setCriteriaForm({ ...criteriaForm, isActive: e.target.value === "true" })}
                            className={styles.criteriaSelect}
                          >
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </select>
                        </div>
                        <div className={styles.criteriaActions}>
                          <button onClick={() => handleSaveCriteria(c.id)} className={styles.saveBtn}>Save</button>
                          <button onClick={() => setEditingCriteria(null)} className={styles.cancelBtn}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.criteriaHeader}>
                          <div>
                            <h3>{c.name}</h3>
                            <span className={styles.criteriaWeight}>{c.weight}%</span>
                          </div>
                          <div className={styles.criteriaActions}>
                            <button
                              onClick={() => {
                                setEditingCriteria(c.id);
                                setCriteriaForm(c);
                              }}
                              className={styles.editBtn}
                            >
                              Edit
                            </button>
                            <button onClick={() => handleDeleteCriteria(c.id)} className={styles.deleteBtn}>
                              Delete
                            </button>
                          </div>
                        </div>
                        <p className={styles.criteriaDescription}>{c.description}</p>
                        <div className={styles.criteriaStatus}>
                          Status: <span className={c.isActive ? styles.activeStatus : styles.inactiveStatus}>
                            {c.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Interview Config Section */}
            {settingsTab === "interview-config" && (
              <div className={styles.interviewConfigSection}>
                <p className={styles.settingsDescription}>
                  Configure interview session limits and candidate cooldown period.
                </p>

                {/* Level-based configurations */}
                {Object.keys(levelInputs).map((level) => (
                  <div key={level} className={styles.interviewConfigCard} style={{ marginTop: "1rem" }}>
                    <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", color: "#333", borderBottom: "1px solid #eee", paddingBottom: "0.5rem" }}>
                      Level: {level === "YP" ? "Young Agriculture Professional (Level 0)" : level === "Junior" ? "Junior Agriculture Professional (Level 1)" : level === "Agri" ? "Agriculture Professional (Level 2)" : "Senior Agriculture Professional (Level 3)"}
                    </h3>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1rem" }}>
                      {/* Max Questions */}
                      <div>
                        <label className={styles.interviewConfigLabel}>Max Questions</label>
                        <input
                          type="number" min={1} max={100}
                          value={levelInputs[level as keyof Levels].max_questions}
                          onChange={(e) => setLevelInputs({
                            ...levelInputs,
                            [level]: { ...levelInputs[level as keyof Levels], max_questions: Number(e.target.value) }
                          })}
                          className={styles.interviewConfigInput}
                          style={{ width: "100%" }}
                        />
                      </div>

                      {/* Max Duration */}
                      <div>
                        <label className={styles.interviewConfigLabel}>Max Duration (min)</label>
                        <input
                          type="number" min={5} max={120}
                          value={levelInputs[level as keyof Levels].max_duration_minutes}
                          onChange={(e) => setLevelInputs({
                            ...levelInputs,
                            [level]: { ...levelInputs[level as keyof Levels], max_duration_minutes: Number(e.target.value) }
                          })}
                          className={styles.interviewConfigInput}
                          style={{ width: "100%" }}
                        />
                      </div>

                      {/* Pass Threshold */}
                      <div>
                        <label className={styles.interviewConfigLabel}>Pass Threshold (/100)</label>
                        <input
                          type="number" min={0} max={100}
                          value={levelInputs[level as keyof Levels].pass_threshold}
                          onChange={(e) => setLevelInputs({
                            ...levelInputs,
                            [level]: { ...levelInputs[level as keyof Levels], pass_threshold: Number(e.target.value) }
                          })}
                          className={styles.interviewConfigInput}
                          style={{ width: "100%" }}
                        />
                      </div>
                      {/* Cooldown Days */}
                      <div>
                        <label className={styles.interviewConfigLabel}>Cooldown (days)</label>
                        <input
                          type="number" min={0} max={365}
                          value={levelInputs[level as keyof Levels].cooldown_days ?? 0}
                          onChange={(e) => setLevelInputs({
                            ...levelInputs,
                            [level]: { ...levelInputs[level as keyof Levels], cooldown_days: Number(e.target.value) }
                          })}
                          className={styles.interviewConfigInput}
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={handleSaveInterviewConfig}
                    disabled={savingConfig}
                    className={styles.saveBtn}
                    style={{ width: "200px", padding: "0.75rem", fontSize: "1rem" }}
                  >
                    {savingConfig ? "Saving Levels…" : "Save Level Configs"}
                  </button>
                </div>

                <hr style={{ margin: "2rem 0", borderTop: "1px solid #ddd" }} />
                
                <h3 style={{ marginBottom: "1rem" }}>Global Settings</h3>

                {/* Max Concurrent Interviews */}
                <div className={styles.interviewConfigCard} style={{ marginTop: "1rem" }}>
                  <label className={styles.interviewConfigLabel}>Maximum Concurrent Interview Slots</label>
                  <div className={styles.interviewConfigRow}>
                    <input
                      type="number"
                      min={1}
                      value={maxConcurrentInput}
                      onChange={(e) => setMaxConcurrentInput(Number(e.target.value))}
                      className={styles.interviewConfigInput}
                    />
                    <button
                      onClick={handleSaveInterviewConfig}
                      disabled={savingConfig || maxConcurrentInput === (interviewConfig.max_concurrent_interviews ?? 20)}
                      className={styles.saveBtn}
                    >
                      {savingConfig ? "Saving…" : "Save"}
                    </button>
                  </div>
                  <p className={styles.interviewConfigHint}>
                    Current: <strong>{interviewConfig.max_concurrent_interviews ?? 20}</strong> simultaneous interview slots. Candidates are denied when this limit is reached.
                  </p>
                </div>
              </div>
            )}

            {/* Anti-Cheat Settings Section */}
            {settingsTab === "anti-cheat" && (
              <div className={styles.interviewConfigSection}>
                <p className={styles.settingsDescription}>
                  Configure anti-cheat thresholds for candidate interviews and platform-wide inactivity timeouts.
                </p>
                <div className={styles.interviewConfigCard}>
                  <label className={styles.interviewConfigLabel}>
                    Interview Idle Threshold (seconds)
                  </label>
                  <div className={styles.interviewConfigRow}>
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={idleThresholdInput}
                      onChange={(e) => setIdleThresholdInput(Number(e.target.value))}
                      className={styles.interviewConfigInput}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#666' }}>seconds</span>
                  </div>
                  <p className={styles.interviewConfigHint}>
                    After {idleThresholdInput}s of no activity during interview → 1st warning. Same trigger again → interview closed. Default: 15s.
                  </p>
                </div>
                <div className={styles.interviewConfigCard} style={{ marginTop: '1rem' }}>
                  <label className={styles.interviewConfigLabel}>
                    Platform Idle Timeout (minutes)
                  </label>
                  <div className={styles.interviewConfigRow}>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={platformIdleInput}
                      onChange={(e) => setPlatformIdleInput(Number(e.target.value))}
                      className={styles.interviewConfigInput}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#666' }}>minutes</span>
                  </div>
                  <p className={styles.interviewConfigHint}>
                    After {platformIdleInput}min of no activity on any candidate page → forced re-login. Applies to all candidate pages except during live interview. Default: 15min.
                  </p>
                </div>
                <button
                  onClick={handleSaveAntiCheatConfig}
                  disabled={
                    savingAntiCheat ||
                    idleThresholdInput === Math.round(antiCheatConfig.idle_threshold_ms / 1000)
                  }
                  className={styles.saveBtn}
                  style={{ marginTop: '1rem' }}
                >
                  {savingAntiCheat ? "Saving…" : "Save Settings"}
                </button>
              </div>
            )}

            {/* Offer Letter Section */}
            {settingsTab === "offer-letter" && (
              <OfferLetterTab adminToken={getAdminToken()} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}