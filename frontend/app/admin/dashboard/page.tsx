"use client";

import { useState, useEffect } from "react";
import styles from "./dashboard.module.css";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import IndiaMap from "../../../components/IndiaMap";
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
type Tab = "live" | "candidates" | "analytics" | "settings";
type SettingsTab = "guidelines" | "criteria";

// Chart colors
const CHART_COLORS = ["#08CB00", "#10b981", "#f59e0b", "#ef4444", "#059669", "#22c55e"];

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  signing: "Signing",
  interview: "Interview",
  summary: "Summary",
  offer: "Offer",
  joining: "Joining",
};

export default function AdminDashboard() {
  const router = useRouter();
  // Authenticated fetch helper — attaches admin token to all API calls
  const withAuth = (url: string, opts: RequestInit = {}) => {
    const token = localStorage.getItem("admin_token");
    const headers: Record<string, string> = {
      ...(token ? { "X-Admin-Token": token } : {}),
      ...(opts.headers as Record<string, string> || {}),
    };
    return fetch(url, { ...opts, headers });
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
  const [uniqueStates, setUniqueStates] = useState<string[]>([]);
  const [stateFunnel, setStateFunnel] = useState<{states: any[]; totalStates: number} | null>(null);
  const [stateFunnelFilter, setStateFunnelFilter] = useState<string>("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [districts, setDistricts] = useState<string[]>([]);

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    const admin = localStorage.getItem("admin_data");
    if (!token || !admin) {
      router.push("/admin/login");
      return;
    }
    setAdminData(JSON.parse(admin));
    loadData();
  }, [router]);

  // Poll for live updates
  useEffect(() => {
    if (activeTab === "live") {
      const interval = setInterval(loadActiveInterviews, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Reload state funnel when filter changes
  useEffect(() => {
    loadStateFunnel();
  }, [stateFunnelFilter]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadActiveInterviews(), loadCandidates(), loadGuidelines(), loadCriteria(), loadGeoStats(), loadStateFunnel()]);
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const res = await withAuth("http://localhost:8000/api/admin/stats");
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
      const res = await withAuth("http://localhost:8000/api/admin/interviews/active");
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
      const res = await withAuth(`http://localhost:8000/api/admin/candidates?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
      }
    } catch (err) {
      console.error("Failed to load candidates:", err);
    }
  };

  const loadStateFunnel = async () => {
    try {
      const url = stateFunnelFilter
        ? `http://localhost:8000/api/admin/stats/by-state?state=${encodeURIComponent(stateFunnelFilter)}`
        : "http://localhost:8000/api/admin/stats/by-state";
      const res = await withAuth(url);
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
      const res = await withAuth("http://localhost:8000/api/admin/stats/geographic");
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
      const res = await withAuth(`http://localhost:8000/api/admin/stats/locations?state=${encodeURIComponent(state)}`);
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
      const res = await withAuth("http://localhost:8000/api/admin/settings/guidelines");
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
      const res = await withAuth("http://localhost:8000/api/admin/settings/evaluation-criteria");
      if (res.ok) {
        const data = await res.json();
        setCriteria(data.criteria || []);
      }
    } catch (err) {
      console.error("Failed to load criteria:", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_data");
    router.push("/admin/login");
  };

  const handleSaveGuideline = async (key: string) => {
    try {
      const res = await withAuth(`http://localhost:8000/api/admin/settings/guidelines/${key}`, {
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
      const res = await withAuth(`http://localhost:8000/api/admin/settings/evaluation-criteria/${id}`, {
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
      const res = await withAuth(`http://localhost:8000/api/admin/settings/evaluation-criteria/${id}`, {
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
                      <th>Phone</th>
                      <th>State</th>
                      <th>Current Phase</th>
                      <th>Phase Progress</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td>{candidate.fullName}</td>
                        <td>{candidate.phone || "-"}</td>
                        <td>{candidate.state || "-"}</td>
                        <td>
                          <span className={styles.phaseBadge}>
                            {PHASE_LABELS[candidate.currentPhase] || candidate.currentPhase}
                          </span>
                        </td>
                        <td>
                          <div className={styles.phaseProgress}>
                            {candidate.phases.map((p, idx) => (
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
                        <td>{candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
            <div className={styles.phase3Header}>
              <h3>🗺️ Geographic Visualizations</h3>
              <span className={styles.phase3Badge}>Phase 3</span>
            </div>

            {/* India State Heat Map (3.2, 3.3) */}
            <div className={styles.mapWrapper}>
              <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#374151" }}>
                India — Candidate Density by State
              </h3>
              {geoStats?.states?.length ? (
                <IndiaMap states={geoStats.states} />
              ) : (
                <p className={styles.mapNoData}>No geographic data available. Add candidates with location data to see the heat map.</p>
              )}
              {geoStats?.states?.length ? (
                <div className={styles.mapLegend}>
                  <span>Low</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {["#dcfce7", "#86efac", "#22c55e", "#16a34a", "#15803d"].map((c) => (
                      <div key={c} className={styles.mapLegendDot} style={{ background: c }} />
                    ))}
                  </div>
                  <span>High</span>
                  <span style={{ marginLeft: 12 }}>Darker green = more candidates</span>
                </div>
              ) : null}
            </div>

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