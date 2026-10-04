"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import styles from "./AnalyticsTab.module.css";

interface AnalyticsTabProps {
  adminApiBase: string;
  getAdminToken: () => string | null;
}

export default function AnalyticsTab({
  adminApiBase,
  getAdminToken,
}: AnalyticsTabProps) {
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [kpiStats, setKpiStats] = useState<any>(null);
  const [phaseStats, setPhaseStats] = useState<any>(null);
  const [geoStats, setGeoStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [kpiModalType, setKpiModalType] = useState("");
  const [kpiModalTitle, setKpiModalTitle] = useState("");
  const [kpiModalData, setKpiModalData] = useState<any[]>([]);
  const [kpiModalLoading, setKpiModalLoading] = useState(false);
  const [kpiModalState, setKpiModalState] = useState("All");
  const [kpiModalDistrict, setKpiModalDistrict] = useState("All");

  const [reportExpanded, setReportExpanded] = useState(false);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportStatus, setReportStatus] = useState("all");
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchKpiModalData = async (type: string, st: string, dist: string) => {
    setKpiModalLoading(true);
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { "X-Admin-Token": token } : {};
      const query = new URLSearchParams({ kpi: type });
      if (st !== "All") query.append("state", st);
      if (dist !== "All") query.append("district", dist);
      
      const res = await fetch(`${adminApiBase}/api/admin/stats/kpi-details?` + query.toString(), { headers });
      if (res.ok) {
        const data = await res.json();
        setKpiModalData(data.candidates || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setKpiModalLoading(false);
    }
  };

  const openKpiModal = (type: string, title: string) => {
    setKpiModalType(type);
    setKpiModalTitle(title);
    setKpiModalOpen(true);
    setKpiModalState("All");
    setKpiModalDistrict("All");
    fetchKpiModalData(type, "All", "All");
  };

  const fetchDetailedReport = async () => {
    setReportLoading(true);
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { "X-Admin-Token": token } : {};
      const query = new URLSearchParams();
      if (reportStartDate) query.append("start_date", reportStartDate);
      if (reportEndDate) query.append("end_date", reportEndDate);
      if (reportStatus && reportStatus !== "all") query.append("status_filter", reportStatus);
      
      const res = await fetch(`${adminApiBase}/api/admin/stats/report?` + query.toString(), { headers });
      if (res.ok) {
        const data = await res.json();
        setReportData(data.report || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (reportExpanded) {
      fetchDetailedReport();
    }
  }, [reportExpanded, reportStartDate, reportEndDate, reportStatus]);

  useEffect(() => {
    if (kpiModalOpen) {
      fetchKpiModalData(kpiModalType, kpiModalState, kpiModalDistrict);
    }
  }, [kpiModalState, kpiModalDistrict]);

  // Independent Filters
  const [kpiState, setKpiState] = useState<string>("All");
  const [kpiDistrict, setKpiDistrict] = useState<string>("All");

  const [tableState, setTableState] = useState<string>("All");
  const [tableDistrict, setTableDistrict] = useState<string>("All");

  const [phaseState, setPhaseState] = useState<string>("All");
  const [phaseDistrict, setPhaseDistrict] = useState<string>("All");

  const [unifiedState, setUnifiedState] = useState<string>("All");
  const [unifiedDistrict, setUnifiedDistrict] = useState<string>("All");

  const [top10State, setTop10State] = useState<string>("All");
  const [top10District, setTop10District] = useState<string>("All");

  const INDIAN_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
    "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
    "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
    "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
    "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
  ];

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchPhaseStats();
  }, [phaseState, phaseDistrict]);

  useEffect(() => {
    fetchKpiStats();
  }, [kpiState, kpiDistrict]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { "X-Admin-Token": token } : {};
      const [statsRes, geoRes] = await Promise.all([
        fetch(`${adminApiBase}/api/admin/stats/overview`, { headers }),
        fetch(`${adminApiBase}/api/admin/geo/stats`, { headers })
      ]);
      if (statsRes.ok) {
        const d = await statsRes.json();
        setGlobalStats(d);
        if (phaseState === "All" && phaseDistrict === "All") {
          setPhaseStats(d);
        }
        if (kpiState === "All" && kpiDistrict === "All") {
          setKpiStats(d);
        }
      }
      if (geoRes.ok) setGeoStats(await geoRes.json());
    } catch (error) {
      console.error("Failed to fetch initial data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchKpiStats = async () => {
    if (kpiState === "All" && kpiDistrict === "All" && globalStats) {
      setKpiStats(globalStats);
      return;
    }
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { "X-Admin-Token": token } : {};
      const url = new URL(`${adminApiBase}/api/admin/stats/overview`);
      if (kpiState !== "All") url.searchParams.append("state", kpiState);
      if (kpiDistrict !== "All") url.searchParams.append("district", kpiDistrict);
      
      const res = await fetch(url.toString(), { headers });
      if (res.ok) setKpiStats(await res.json());
    } catch (error) {
      console.error("Failed to fetch kpi stats:", error);
    }
  };

  const fetchPhaseStats = async () => {
    // Prevent refetching global stats on mount if we just loaded them
    if (phaseState === "All" && phaseDistrict === "All" && globalStats) {
      setPhaseStats(globalStats);
      return;
    }
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { "X-Admin-Token": token } : {};
      const url = new URL(`${adminApiBase}/api/admin/stats/overview`);
      if (phaseState !== "All") url.searchParams.append("state", phaseState);
      if (phaseDistrict !== "All") url.searchParams.append("district", phaseDistrict);
      
      const res = await fetch(url.toString(), { headers });
      if (res.ok) setPhaseStats(await res.json());
    } catch (error) {
      console.error("Failed to fetch phase stats:", error);
    }
  };

  const uniqueStates = useMemo(() => {
    if (!geoStats) return INDIAN_STATES;
    const statesFromDb = geoStats.uniqueStates || [];
    const all = new Set([...statesFromDb, ...INDIAN_STATES]);
    return Array.from(all).sort();
  }, [geoStats]);

  // Helper to get available districts for any selected state
  const getAvailableDistricts = (targetState: string) => {
    if (!geoStats?.districts) return [];
    if (targetState === "All") return [];
    const districtsSet = new Set<string>();
    geoStats.districts.forEach((d: any) => {
      if (d.state === targetState && d.district && d.district !== "Unknown") {
        districtsSet.add(d.district);
      }
    });
    const districtsArray = Array.from(districtsSet).sort();
    return [...districtsArray, "Unknown"];
  };

  const kpiDistricts = useMemo(() => getAvailableDistricts(kpiState), [geoStats, kpiState]);
  const tableDistricts = useMemo(() => getAvailableDistricts(tableState), [geoStats, tableState]);
  const phaseDistricts = useMemo(() => getAvailableDistricts(phaseState), [geoStats, phaseState]);
  const unifiedDistricts = useMemo(() => getAvailableDistricts(unifiedState), [geoStats, unifiedState]);
  const top10Districts = useMemo(() => getAvailableDistricts(top10State), [geoStats, top10State]);

  // Distribution Table Data
  const distributionData = useMemo(() => {
    if (!geoStats) return [];
    let result = [];
    if (tableState === "All") {
      const stateMap = new Map();
      (geoStats.states || []).forEach((s: any) => stateMap.set(s.state, s));
      INDIAN_STATES.forEach(s => {
          if (!stateMap.has(s)) {
             stateMap.set(s, { state: s, total: 0, pending: 0, interviewed: 0, selected: 0, rejected: 0, passRate: 0 });
          }
      });
      if (stateMap.has("Unknown")) {
        const unk = stateMap.get("Unknown");
        stateMap.delete("Unknown");
        stateMap.set("Unknown", unk);
      }
      result = Array.from(stateMap.values());
    } else {
      let filtered = geoStats.districts.filter((d: any) => d.state === tableState);
      if (tableDistrict !== "All") {
        filtered = filtered.filter((d: any) => d.district === tableDistrict);
      }
      result = filtered.map((d: any) => ({ ...d, locationName: d.district }));
    }
    
    result.sort((a: any, b: any) => {
        const nameA = tableState === "All" ? a.state : a.locationName;
        const nameB = tableState === "All" ? b.state : b.locationName;
        if (nameA === "Unknown") return 1;
        if (nameB === "Unknown") return -1;
        return b.total - a.total;
    });
    
    return result;
  }, [geoStats, tableState, tableDistrict]);

  // Top 10 Locations Data
  const top10Data = useMemo(() => {
    if (!geoStats) return [];
    let list = [];
    if (top10State === "All") {
      list = (geoStats.states || []).map((s: any) => ({ name: s.state, value: s.total }));
    } else {
      let districts = geoStats.districts.filter((d: any) => d.state === top10State);
      if (top10District !== "All") {
          districts = districts.filter((d: any) => d.district === top10District);
      }
      list = districts.map((d: any) => ({ name: d.district, value: d.total }));
    }
    return list
      .filter((item: any) => item.name !== "Unknown")
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);
  }, [geoStats, top10State, top10District]);

  // Unified Graph Data
  const unifiedGraphData = useMemo(() => {
    if (!geoStats) return [];
    let list = [];
    if (unifiedState === "All") {
       list = (geoStats.states || []).map((s: any) => ({
         name: s.state,
         Passed: s.selected || 0,
         Failed: s.rejected || 0,
         total: s.total
       }));
    } else {
       let districts = (geoStats.districts || []).filter((d: any) => d.state === unifiedState);
       if (unifiedDistrict !== "All") {
          districts = districts.filter((d: any) => d.district === unifiedDistrict);
       }
       list = districts.map((d: any) => ({
         name: d.district,
         Passed: d.selected || 0,
         Failed: d.rejected || 0,
         total: d.total
       }));
    }
    return list
      .filter((item: any) => item.name !== "Unknown")
      .sort((a: any, b: any) => b.total - a.total)
      .slice(0, 7);
  }, [geoStats, unifiedState, unifiedDistrict]);

  const candidatesByPhase = [
    { name: "Onboarding", value: phaseStats?.byPhase?.onboarding || 0 },
    { name: "Interview", value: phaseStats?.byPhase?.interview || 0 },
    { name: "Selected", value: phaseStats?.totalPass || 0 },
    { name: "Course", value: phaseStats?.byPhase?.foundation || 0 },
    { name: "Rejected", value: phaseStats?.totalFail || 0 },
  ];

  if (loading) {
    return (
      <div className={styles.dashboardContainer}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonBox} style={{ height: '120px', borderRadius: '12px' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className={styles.skeletonBox} style={{ height: '300px', borderRadius: '12px' }} />
          <div className={styles.skeletonBox} style={{ height: '300px', borderRadius: '12px' }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.kpiContainer}>
        <div className={styles.chartHeaderSpace}>
          <h2 className={styles.sectionTitle}>KPI OVERVIEW CARDS</h2>
          <div className={styles.filters}>
            <label>Select State:</label>
            <select value={kpiState} onChange={(e) => { setKpiState(e.target.value); setKpiDistrict("All"); }}>
              <option value="All">All</option>
              {uniqueStates.map((s: string) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {kpiState !== "All" && (
              <>
                <label>Select District:</label>
                <select value={kpiDistrict} onChange={(e) => setKpiDistrict(e.target.value)}>
                  <option value="All">All</option>
                  {kpiDistricts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
                <div className={styles.kpiGrid}>
          <div className={`${styles.kpiCard} ${styles.blueCard}`} onClick={() => openKpiModal('totalCandidates', 'Total Candidates Registered')} style={{ cursor: 'pointer' }}>
            <span className={styles.kpiIcon} style={{ display: 'inline-flex', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </span>
            <div className={styles.kpiLabel}>Total Candidates Registered</div>
            <div className={styles.kpiValue}>{kpiStats?.totalCandidates || 0}</div>
          </div>
          <div className={`${styles.kpiCard}`} style={{ borderColor: '#8b5cf6', background: 'linear-gradient(to bottom right, #f3e8ff, #ffffff)', cursor: 'pointer' }} onClick={() => openKpiModal('totalSelected', 'Total Candidates Selected')}>
            <span className={styles.kpiIcon} style={{ display: 'inline-flex', justifyContent: 'center', background: '#ede9fe', color: '#8b5cf6' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="8.5" cy="7" r="4"></circle>
                <line x1="20" y1="8" x2="20" y2="14"></line>
                <line x1="23" y1="11" x2="17" y2="11"></line>
              </svg>
            </span>
            <div className={styles.kpiLabel}>Total Candidates Selected</div>
            <div className={styles.kpiValue}>{kpiStats?.totalSelected || 0}</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.greenCard}`} onClick={() => openKpiModal('totalPass', 'Total Candidates Passed')} style={{ cursor: 'pointer' }}>
            <span className={styles.kpiIcon} style={{ display: 'inline-flex', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </span>
            <div className={styles.kpiLabel}>Total Candidates Passed</div>
            <div className={styles.kpiValue}>{kpiStats?.totalPass || 0}</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.redCard}`} onClick={() => openKpiModal('totalFail', 'Total Candidates Failed')} style={{ cursor: 'pointer' }}>
            <span className={styles.kpiIcon} style={{ display: 'inline-flex', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </span>
            <div className={styles.kpiLabel}>Total Candidates Failed</div>
            <div className={styles.kpiValue}>{kpiStats?.totalFail || 0}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiIconSmall}>📄</span>
            <div className={styles.kpiLabelSmall}>Onboarding</div>
            <div className={styles.kpiValueSmall}>{kpiStats?.byPhase?.onboarding || 0}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiIconSmall}>🎙️</span>
            <div className={styles.kpiLabelSmall}>Interview</div>
            <div className={styles.kpiValueSmall}>{kpiStats?.byPhase?.interview || 0}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiIconSmall}>📑</span>
            <div className={styles.kpiLabelSmall}>Summary</div>
            <div className={styles.kpiValueSmall}>{kpiStats?.byPhase?.summary || 0}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiIconSmall}>🎓</span>
            <div className={styles.kpiLabelSmall}>Course</div>
            <div className={styles.kpiValueSmall}>{kpiStats?.byPhase?.foundation || 0}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiIconSmall}>📎</span>
            <div className={styles.kpiLabelSmall}>Docs Submission</div>
            <div className={styles.kpiValueSmall}>{kpiStats?.byPhase?.documents || 0}</div>
          </div>
        </div>
      </div>

              <div style={{ marginTop: '24px', marginBottom: '24px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div 
            style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: reportExpanded ? '1px solid #e2e8f0' : 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setReportExpanded(!reportExpanded)}
          >
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Detailed Date-wise Candidate Report</h2>
            <span>{reportExpanded ? '▲ Collapse' : '▼ Expand'}</span>
          </div>
          {reportExpanded && (
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Start Date</label>
                  <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>End Date</label>
                  <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Status</label>
                  <select value={reportStatus} onChange={e => setReportStatus(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: 'white' }}>
                    <option value="all">All Candidates</option>
                    <option value="onboarded">Onboarded / Selected</option>
                    <option value="interviewing">Attending Interview</option>
                    <option value="docs_not_selected">Docs Submitted but Not Selected</option>
                  </select>
                </div>
              </div>
              
              {reportLoading ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>Loading report...</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        {reportStatus === "interviewing" || reportStatus === "attended_interview" ? (
                          <>
                            <th>Total Attempts</th>
                            <th>Attempt Details (Date - Result - Score)</th>
                          </>
                        ) : reportStatus === "docs_not_selected" ? (
                          <>
                            <th>Phone</th>
                            <th>Docs Submitted Date</th>
                          </>
                        ) : (
                          <>
                            <th>Phone</th>
                            <th>Joined Date</th>
                            {reportStatus !== "onboarded" && <th>Current Phase</th>}
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.length > 0 ? reportData.map((cand: any) => (
                        <tr key={cand.id}>
                          <td>{cand.fullName}</td>
                          <td>{cand.email}</td>
                          {reportStatus === "interviewing" || reportStatus === "attended_interview" ? (
                            <>
                              <td>{cand.total_attempts}</td>
                              <td>
                                {cand.attempts && cand.attempts.length > 0 ? cand.attempts.map((att: any, idx: number) => (
                                  <div key={idx} style={{ fontSize: '12px', marginBottom: '4px' }}>
                                    {new Date(att.date).toLocaleDateString()} - {att.result} - {att.score.toFixed(1)}
                                  </div>
                                )) : 'No details'}
                              </td>
                            </>
                          ) : reportStatus === "docs_not_selected" ? (
                            <>
                              <td>{cand.phone}</td>
                              <td>{cand.documents_submitted_at ? new Date(cand.documents_submitted_at).toLocaleDateString() : 'Unknown'}</td>
                            </>
                          ) : (
                            <>
                              <td>{cand.phone}</td>
                              <td>{new Date(cand.created_at).toLocaleDateString()}</td>
                              {reportStatus !== "onboarded" && <td><span className={styles.statusBadge}>{cand.current_phase}</span></td>}
                            </>
                          )}
                        </tr>
                      )) : (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>No candidates found for this period and status.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.distributionContainer}>
        <div className={styles.tableHeaderRow}>
          <h2 className={styles.sectionTitle}>CANDIDATE DISTRIBUTION</h2>
          <div className={styles.filters}>
            <label>Select State:</label>
            <select value={tableState} onChange={(e) => { setTableState(e.target.value); setTableDistrict("All"); }}>
              <option value="All">All</option>
              {uniqueStates.map((s: string) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {tableState !== "All" && (
              <>
                <label>Select District:</label>
                <select value={tableDistrict} onChange={(e) => setTableDistrict(e.target.value)}>
                  <option value="All">All</option>
                  {tableDistricts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Location</th>
                <th>Total</th>
                <th>Onboarding</th>
                <th>Interview</th>
                <th>Selected</th>
                <th>Rejected</th>
                <th>Pass Rate (%)</th>
              </tr>
            </thead>
            <tbody>
              {distributionData.map((row: any, i: number) => {
                const isState = tableState === "All";
                const locationName = isState ? row.state : row.district;
                const passRate = row.passRate || 0;
                const passClass = passRate >= 60 ? styles.textGreen : styles.textRed;
                return (
                  <tr key={i}>
                    <td className={styles.boldText}>{locationName}</td>
                    <td>{row.total}</td>
                    <td>{row.pending || 0}</td>
                    <td>{row.interviewed || 0}</td>
                    <td>{row.selected || 0}</td>
                    <td>{row.rejected || 0}</td>
                    <td className={passClass}>{passRate}%</td>
                  </tr>
                );
              })}
              {distributionData.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "20px" }}>
                    No data available for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <div className={styles.chartHeaderSpace}>
            <h2 className={styles.sectionTitle}>CANDIDATES BY PHASE</h2>
            <div className={styles.chartFilters}>
              <select value={phaseState} onChange={(e) => { setPhaseState(e.target.value); setPhaseDistrict("All"); }} className={styles.chartSelect}>
                <option value="All">All States</option>
                {uniqueStates.map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {phaseState !== "All" && (
                <select value={phaseDistrict} onChange={(e) => setPhaseDistrict(e.target.value)} className={styles.chartSelect}>
                  <option value="All">All Districts</option>
                  {phaseDistricts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              layout="vertical"
              data={candidatesByPhase}
              margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
            >
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={80} />
              <Tooltip cursor={{ fill: "transparent" }} />
              <Bar dataKey="value" fill="#2d5e75" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHeaderSpace}>
            <h2 className={styles.sectionTitle}>UNIFIED PASS/FAIL GRAPH</h2>
            <div className={styles.chartFilters}>
              <select value={unifiedState} onChange={(e) => { setUnifiedState(e.target.value); setUnifiedDistrict("All"); }} className={styles.chartSelect}>
                <option value="All">All States</option>
                {uniqueStates.map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {unifiedState !== "All" && (
                <select value={unifiedDistrict} onChange={(e) => setUnifiedDistrict(e.target.value)} className={styles.chartSelect}>
                  <option value="All">All Districts</option>
                  {unifiedDistricts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart
              data={unifiedGraphData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Passed" fill="#10b981" barSize={30} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Failed" fill="#ef4444" barSize={30} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="Passed" stroke="#0f172a" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.top10Container}>
        <div className={styles.tableHeaderRow}>
          <h2 className={styles.sectionTitle}>
            TOP 10 {top10State === "All" ? "STATES" : "DISTRICTS"}
          </h2>
          <div className={styles.filters}>
            <select value={top10State} onChange={(e) => { setTop10State(e.target.value); setTop10District("All"); }}>
              <option value="All">All States</option>
              {uniqueStates.map((s: string) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {top10State !== "All" && (
              <select value={top10District} onChange={(e) => setTop10District(e.target.value)}>
                <option value="All">All Districts</option>
                {top10Districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className={styles.top10List}>
          {top10Data.length > 0 ? (
            top10Data.map((item: any, idx: number) => {
              const maxVal = top10Data[0].value || 1;
              const percent = (item.value / maxVal) * 100;
              return (
                <div key={idx} className={styles.top10Item}>
                  <div className={styles.top10Rank}>{idx + 1}</div>
                  <div className={styles.top10Name}>{item.name}</div>
                  <div className={styles.top10BarContainer}>
                    <div className={styles.top10BarFill} style={{ width: `${percent}%` }} />
                  </div>
                  <div className={styles.top10Value}>{item.value}</div>
                </div>
              );
            })
          ) : (
             <div style={{ padding: "20px" }}>No data</div>
          )}
        </div>
      </div>
      {kpiModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setKpiModalOpen(false)}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '24px', width: '90%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{kpiModalTitle}</h2>
              <button onClick={() => setKpiModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <select value={kpiModalState} onChange={(e) => { setKpiModalState(e.target.value); setKpiModalDistrict("All"); }} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                <option value="All">All States</option>
                {geoStats && Object.keys(geoStats.by_state || {}).map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {kpiModalState !== "All" && (
                <select value={kpiModalDistrict} onChange={(e) => setKpiModalDistrict(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  <option value="All">All Districts</option>
                  {geoStats && geoStats.by_state[kpiModalState] && Object.keys(geoStats.by_state[kpiModalState].by_district || {}).map((d: string) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </div>

            {kpiModalLoading ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>Loading...</div>
            ) : kpiModalData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#666' }}>No candidates found for this KPI.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>State</th>
                    {kpiModalType === 'totalPass' || kpiModalType === 'totalFail' ? (
                      <>
                        <th>Total Attempts</th>
                        <th>Attempt Details (Date - Result - Score)</th>
                      </>
                    ) : kpiModalType === 'totalSelected' ? (
                      <>
                        <th>Joined Date</th>
                        <th>Docs Submitted Date</th>
                        <th>Selected?</th>
                      </>
                    ) : (
                      <>
                        <th>Phone</th>
                        <th>Joined Date</th>
                        <th>Phase</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {kpiModalData.map((cand: any) => (
                    <tr key={cand.id}>
                      <td>{cand.fullName}</td>
                      <td>{cand.email}</td>
                      <td>{cand.state}</td>
                      {kpiModalType === 'totalPass' || kpiModalType === 'totalFail' ? (
                        <>
                          <td>{cand.total_attempts}</td>
                          <td>
                            {cand.attempts && cand.attempts.length > 0 ? cand.attempts.map((att: any, idx: number) => (
                              <div key={idx} style={{ fontSize: '12px', marginBottom: '4px' }}>
                                {new Date(att.date).toLocaleDateString()} - {att.result} - {att.score.toFixed(1)}
                              </div>
                            )) : 'No details'}
                          </td>
                        </>
                      ) : kpiModalType === 'totalSelected' ? (
                        <>
                          <td>{new Date(cand.created_at).toLocaleDateString()}</td>
                          <td>{cand.documents_submitted_at ? new Date(cand.documents_submitted_at).toLocaleDateString() : 'Unknown'}</td>
                          <td>Yes</td>
                        </>
                      ) : (
                        <>
                          <td>{cand.phone}</td>
                          <td>{new Date(cand.created_at).toLocaleDateString()}</td>
                          <td><span className={styles.statusBadge}>{cand.current_phase}</span></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
