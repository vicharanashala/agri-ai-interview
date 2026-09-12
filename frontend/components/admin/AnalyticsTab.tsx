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
    return <div className={styles.loading}>Loading Analytics Dashboard...</div>;
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
          <div className={`${styles.kpiCard} ${styles.blueCard}`}>
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
          <div className={`${styles.kpiCard} ${styles.greenCard}`}>
            <span className={styles.kpiIcon} style={{ display: 'inline-flex', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </span>
            <div className={styles.kpiLabel}>Total Candidates Passed</div>
            <div className={styles.kpiValue}>{kpiStats?.totalPass || 0}</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.redCard}`}>
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
    </div>
  );
}
