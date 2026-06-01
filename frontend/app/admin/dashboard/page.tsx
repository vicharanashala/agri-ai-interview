"use client";

import { useState, useEffect } from "react";
import styles from "./dashboard.module.css";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import LiveTab from "../../../components/admin/LiveTab";

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
  createdAt?: string;
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
type Tab = "live" | "candidates" | "analytics" | "anti-cheat" | "settings";
type SettingsTab = "guidelines" | "criteria";

// Chart colors
const CHART_COLORS = ["#08CB00", "#10b981", "#f59e0b", "#ef4444", "#059669", "#22c55e"];

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  interview: "Interview",
  summary: "Summary",
  offer: "Offer",
  signing: "Signing",
  joining: "Joining",
};

// Points to the Next.js rewrite proxy so the browser talks to a single origin.
// In Docker, this resolves to the Next.js server; locally it falls back to the
// direct backend URL for development outside Docker.
const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

export default function AdminDashboard() {
  const router = useRouter();
  // Authenticated fetch helper — browser automatically sends the admin_session
  // cookie (httpOnly, path=/api/admin) with every proxied /api/admin/* request.
  // No localStorage or X-Admin-Token header needed.
  const withAuth = (url: string, opts: RequestInit = {}) => {
    return fetch(`${ADMIN_API_BASE}${url}`, { ...opts, credentials: "include" });
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

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats().catch(err => console.error("loadStats error:", err)),
        loadActiveInterviews().catch(err => console.error("loadActiveInterviews error:", err)),
        loadCandidates().catch(err => console.error("loadCandidates error:", err)),
        loadGuidelines().catch(err => console.error("loadGuidelines error:", err)),
        loadCriteria().catch(err => console.error("loadCriteria error:", err)),
        loadGeoStats().catch(err => console.error("loadGeoStats error:", err)),
        loadStateFunnel().catch(err => console.error("loadStateFunnel error:", err)),
        loadViolations().catch(err => console.error("loadViolations error:", err)),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await withAuth("/api/admin/stats");
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

  const loadCandidates = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (phaseFilter) params.append("phase", phaseFilter);
      if (stateFilter) params.append("state", stateFilter);
      if (districtFilter) params.append("district", districtFilter);
      const res = await withAuth(`/api/admin/candidates?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
      }
    } catch (err) {
      console.error("Failed to load candidates:", err);
    }
  };

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

  const loadViolations = async () => {
    setViolationsLoading(true);
    try {
      const res = await withAuth("/api/admin/anti-cheat/violations");
      if (res.ok) {
        const data = await res.json();
        setViolations(data.violations || []);
      }
    } catch (err) {
      console.error("Failed to load violations:", err);
    } finally {
      setViolationsLoading(false);
    }
  };

  const loadStateFunnel = async () => {
    try {
      const path = stateFunnelFilter
        ? `/api/admin/stats/by-state?state=${encodeURIComponent(stateFunnelFilter)}`
        : "/api/admin/stats/by-state";
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
    loadCandidates();
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
      const res = await withAuth("/api/admin/settings/evaluation-criteria");
      if (res.ok) {
        const data = await res.json();
        setCriteria(data.criteria || []);
      }
    } catch (err) {
      console.error("Failed to load criteria:", err);
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
      const res = await withAuth(`/api/admin/settings/evaluation-criteria/${id}`, {
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
      const res = await withAuth(`/api/admin/settings/evaluation-criteria/${id}`, {
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

  // Prepare chart data
  const phaseDistributionData = Object.entries(stats.phaseDistribution || {}).map(([phase, count]) => ({
    name: PHASE_LABELS[phase] || phase,
    value: count as number
  }));

  const statusDistributionData = Object.entries(stats.statusDistribution || {}).map(([status, count]) => ({
    name: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: count as number
  }));

  const stateDistributionData = geoStats?.stateDistribution 
    ? Object.entries(geoStats.stateDistribution).map(([state, count]) => ({
        name: state,
        candidates: count as number
      }))
    : [];

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

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
          👥 All Candidates ({candidates.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "analytics" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          📊 Analytics
        </button>
        <button
          className={`${styles.tab} ${activeTab === "anti-cheat" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("anti-cheat")}
        >
          🛡️ Anti-Cheat
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
                onChange={(e) => { setPhaseFilter(e.target.value); loadCandidates(); }}
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
                  onChange={(e) => { setDistrictFilter(e.target.value); loadCandidates(); }}
                  className={styles.phaseSelect}
                >
                  <option value="">All Districts</option>
                  {districts.map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              )}
              <button onClick={loadCandidates} className={styles.searchBtn}>Search</button>
            </div>

            {/* Candidates Table */}
            {candidates.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No candidates found</p>
              </div>
            ) : (
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
                        <td>{candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          <div className={styles.analyticsContainer}>
            <h2 className={styles.analyticsTitle}>Interview Analytics</h2>

            {/* Phase & Status Charts */}
            <div className={styles.chartsGrid}>
              <div className={styles.chartCard}>
                <h3>Candidates by Phase</h3>
                {phaseDistributionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={phaseDistributionData}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#08CB00" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.noDataMessage}>No phase data available</p>
                )}
              </div>

              <div className={styles.chartCard}>
                <h3>Status Distribution</h3>
                {statusDistributionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={statusDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                        outerRadius={90}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.noDataMessage}>No status data available</p>
                )}
              </div>
            </div>

            {/* State Funnel — onboarding → interview → pass/fail → offer accepted */}
            <div className={styles.analyticsSection}>
              <h3 className={styles.analyticsSectionTitle}>
                📊 State-wise Interview Funnel
                <span className={styles.geoCountBadge}>{stateFunnel?.totalStates ?? 0} states</span>
              </h3>

              {/* Filter */}
              <div className={styles.geoFilterRow}>
                <label>Filter by state:</label>
                <select
                  value={stateFunnelFilter}
                  onChange={(e) => setStateFunnelFilter(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="">All States</option>
                  {(stateFunnel?.states ?? []).map((s: any) => (
                    <option key={s.state} value={s.state}>{s.state}</option>
                  ))}
                </select>
              </div>

              {/* Table */}
              {stateFunnel?.states?.length ? (
                <div className={styles.funnelTableWrapper}>
                  <table className={styles.funnelTable}>
                    <thead>
                      <tr>
                        <th>State</th>
                        <th>Onboarding</th>
                        <th>Interviewed</th>
                        <th>Passed</th>
                        <th>Failed</th>
                        <th>Pass Rate</th>
                        <th>Offer Extended</th>
                        <th>Offer Accepted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stateFunnel.states.map((s: any) => (
                        <tr key={s.state}>
                          <td className={styles.stateCell}>{s.state}</td>
                          <td><span className={styles.funnelCount}>{s.onboarding}</span></td>
                          <td><span className={styles.funnelCountInterviewed}>{s.interviewed}</span></td>
                          <td><span className={styles.funnelPass}>{s.passed}</span></td>
                          <td><span className={styles.funnelFail}>{s.failed}</span></td>
                          <td>
                            <span className={s.passRate >= 60 ? styles.funnelPass : s.passRate > 0 ? styles.funnelFail : ''}>
                              {s.passRate}%
                            </span>
                          </td>
                          <td><span className={styles.funnelNeutral}>{s.offerExtended}</span></td>
                          <td><span className={styles.funnelOfferAccepted}>{s.offerAccepted}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.noDataMessage}>No funnel data available</p>
              )}
            </div>

            {/* Pass / Fail Rate Charts by State and District */}
            <div className={styles.chartsRow}>
              <div className={styles.chartWrapper}>
                <h3>Pass/Fail Rate by State</h3>
                {geoStats?.topStates?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={geoStats.topStates.slice(0, 8)}>
                      <XAxis dataKey="state" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="selected" name="Passed" fill="#08CB00" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="rejected" name="Rejected" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.noDataMessage}>No state data</p>
                )}
              </div>

              <div className={styles.chartWrapper}>
                <h3>Pass/Fail Rate by District</h3>
                {geoStats?.topDistricts?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={geoStats.topDistricts.slice(0, 8).map((d: any) => ({
                      district: d.district,
                      selected: d.selected,
                      rejected: d.rejected,
                    }))}>
                      <XAxis dataKey="district" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="selected" name="Passed" fill="#08CB00" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="rejected" name="Rejected" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.noDataMessage}>No district data</p>
                )}
              </div>
            </div>

            {/* State-wise Candidate Table (2.4) */}
            <div className={styles.analyticsSection}>
              <h3 className={styles.analyticsSectionTitle}>
                📍 State-wise Candidate Distribution
                <span className={styles.geoCountBadge}>{geoStats?.states?.length ?? 0} states</span>
              </h3>
              {geoStats?.states?.length > 0 ? (
                <div className={styles.geoScroll}>
                  <table className={styles.geoTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>State</th>
                        <th>Total</th>
                        <th>Pending</th>
                        <th>Interviewed</th>
                        <th>Selected</th>
                        <th>Rejected</th>
                        <th>Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geoStats.states.map((s: any, i: number) => {
                        const passRate = s.passRate ?? 0;
                        const fillClass = passRate < 40 ? styles.passRateFillVeryLow : passRate < 70 ? styles.passRateFillLow : styles.passRateFill;
                        return (
                          <tr key={s.state}>
                            <td>{i + 1}</td>
                            <td style={{ fontWeight: 600, color: "#374151" }}>{s.state}</td>
                            <td>{s.total}</td>
                            <td>{s.pending}</td>
                            <td>{s.interviewed}</td>
                            <td style={{ color: "#10b981", fontWeight: 600 }}>{s.selected}</td>
                            <td style={{ color: "#ef4444" }}>{s.rejected}</td>
                            <td>
                              <div className={styles.passRateBar}>
                                <div className={styles.passRateTrack}>
                                  <div className={`${styles.passRateFill} ${fillClass}`} style={{ width: `${passRate}%` }} />
                                </div>
                                <span className={styles.passRateText}>{passRate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.noDataMessage}>No state data available</p>
              )}
            </div>

            {/* District-wise Candidate Table (2.5) */}
            <div className={styles.analyticsSection}>
              <h3 className={styles.analyticsSectionTitle}>
                🏞️ District-wise Candidate Distribution
                <span className={styles.geoCountBadge}>{geoStats?.districts?.length ?? 0} districts</span>
              </h3>
              {geoStats?.districts?.length > 0 ? (
                <div className={styles.geoScroll}>
                  <table className={styles.geoTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>State</th>
                        <th>District</th>
                        <th>Total</th>
                        <th>Pending</th>
                        <th>Selected</th>
                        <th>Rejected</th>
                        <th>Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geoStats.districts.slice(0, 50).map((d: any, i: number) => {
                        const passRate = d.passRate ?? 0;
                        const fillClass = passRate < 40 ? styles.passRateFillVeryLow : passRate < 70 ? styles.passRateFillLow : styles.passRateFill;
                        return (
                          <tr key={`${d.state}_${d.district}`}>
                            <td>{i + 1}</td>
                            <td style={{ color: "#6b7280" }}>{d.state}</td>
                            <td style={{ fontWeight: 600, color: "#374151" }}>{d.district}</td>
                            <td>{d.total}</td>
                            <td>{d.pending}</td>
                            <td style={{ color: "#10b981", fontWeight: 600 }}>{d.selected}</td>
                            <td style={{ color: "#ef4444" }}>{d.rejected}</td>
                            <td>
                              <div className={styles.passRateBar}>
                                <div className={styles.passRateTrack}>
                                  <div className={`${styles.passRateFill} ${fillClass}`} style={{ width: `${passRate}%` }} />
                                </div>
                                <span className={styles.passRateText}>{passRate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.noDataMessage}>No district data available</p>
              )}
            </div>

            {/* ============================================
                 Phase 3: Geographic Visualizations
            ============================================ */}

            {/* Phase 3 Header */}

            {/* Top 10 States + Top 10 Districts (3.6, 3.7) */}
            <div className={styles.top10Grid}>
              <div className={styles.top10Card}>
                <h3>🏆 Top 10 States by Candidates</h3>
                {geoStats?.topStates?.length > 0 ? (
                  <>
                    {geoStats.topStates.slice(0, 10).map((s: any, i: number) => {
                      const maxTotal = geoStats.topStates[0]?.total || 1;
                      return (
                        <div key={s.state} className={styles.top10Item}>
                          <div className={`${styles.top10Rank} ${i < 3 ? styles.top10RankTop : ""}`}>
                            {i + 1}
                          </div>
                          <div className={styles.top10Name}>{s.state}</div>
                          <div className={styles.top10Bar}>
                            <div className={styles.top10BarFill} style={{ width: `${(s.total / maxTotal) * 100}%` }} />
                          </div>
                          <div className={styles.top10Count}>{s.total}</div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className={styles.noDataMessage}>No data</p>
                )}
              </div>

              <div className={styles.top10Card}>
                <h3>🏞️ Top 10 Districts by Candidates</h3>
                {geoStats?.topDistricts?.length > 0 ? (
                  <>
                    {geoStats.topDistricts.slice(0, 10).map((d: any, i: number) => {
                      const maxTotal = geoStats.topDistricts[0]?.total || 1;
                      return (
                        <div key={`${d.state}_${d.district}`} className={styles.top10Item}>
                          <div className={`${styles.top10Rank} ${i < 3 ? styles.top10RankTop : ""}`}>
                            {i + 1}
                          </div>
                          <div className={styles.top10Name}>{d.district}, {d.state}</div>
                          <div className={styles.top10Bar}>
                            <div className={styles.top10BarFill} style={{ width: `${(d.total / maxTotal) * 100}%` }} />
                          </div>
                          <div className={styles.top10Count}>{d.total}</div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className={styles.noDataMessage}>No data</p>
                )}
              </div>
            </div>

            {/* Geographic Comparison Charts (3.5) */}
            <div className={styles.comparisonGrid}>
              <div className={styles.comparisonCard}>
                <h3>Top 10 States — Candidate Distribution</h3>
                {geoStats?.topStates?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={geoStats.topStates.slice(0, 10)} layout="vertical">
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="state" width={90} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="total" name="Candidates" fill="#059669" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.noDataMessage}>No state data</p>
                )}
              </div>

              <div className={styles.comparisonCard}>
                <h3>Top 10 Districts — Candidate Distribution</h3>
                {geoStats?.topDistricts?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={geoStats.topDistricts.slice(0, 10).map((d: any) => ({
                      district: `${d.district} (${d.state})`,
                      total: d.total,
                    }))} layout="vertical">
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="district" width={90} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="total" name="Candidates" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={styles.noDataMessage}>No district data</p>
                )}
              </div>
            </div>
          </div>
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
          </div>
        )}
      </div>
    </div>
  );
}