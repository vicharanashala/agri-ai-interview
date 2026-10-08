"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
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
import PageSelector from "./PageSelector";

// KPI overview funnel cards. `kpi` is both the key in the overview `funnel` counts and the kpi-details
// type the card's modal loads; `of` is the card whose count is this card's denominator.
const FUNNEL_CARDS = [
  {
    kpi: "registered",
    label: "Total Candidates Registered",
    tooltip: "Total candidates who created an account on Anveshan.",
    accent: "blueCard",
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </>
    ),
  },
  {
    kpi: "profileCompleted",
    of: "registered",
    label: "Total Candidates Completed Profile",
    tooltip: "Candidates who submitted their profile, out of all registered candidates.",
    accent: "skyCard",
    icon: (
      <>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
        <rect x="8" y="2" width="8" height="4" rx="1"></rect>
        <polyline points="9 14 11 16 15 12"></polyline>
      </>
    ),
  },
  {
    kpi: "attendedInterview",
    of: "profileCompleted",
    label: "Total Candidates Attended Interview",
    tooltip: "Candidates who actually attended the interview, out of completed profiles.",
    accent: "amberCard",
    icon: (
      <>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </>
    ),
  },
  {
    kpi: "passedInterview",
    of: "attendedInterview",
    label: "Total Candidates Passed Interview",
    tooltip: "Candidates who passed the interview, out of those who attended.",
    accent: "greenCard",
    icon: (
      <>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </>
    ),
  },
  {
    kpi: "failedInterview",
    of: "attendedInterview",
    label: "Total Candidates Failed",
    tooltip: "Candidates who failed the interview, out of those who attended.",
    accent: "redCard",
    icon: (
      <>
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </>
    ),
  },
  {
    kpi: "reattempted",
    of: "attendedInterview",
    label: "Total Candidates Took Reattempt",
    tooltip: "Candidates who took a reattempt, out of those who attended.",
    accent: "purpleCard",
    icon: (
      <>
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </>
    ),
  },
] as const;

// Post-interview funnel rows below the first row; each card's `of` again names its denominator card
const STAGE_ROWS = [
  {
    title: "Foundation Course",
    cards: [
      {
        kpi: "foundationPhase",
        of: "passedInterview",
        label: "Candidates in Foundation Phase",
        tooltip: "Candidates who passed the interview and are now in the Foundation Course stage.",
        accent: "tealCard",
        icon: (
          <>
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </>
        ),
      },
      {
        kpi: "foundationNotStarted",
        of: "foundationPhase",
        label: "Foundation Course Not Started",
        tooltip: "Candidates who reached the Foundation Course stage but have not started the course yet.",
        accent: "tealCard",
        icon: (
          <>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="10" y1="15" x2="10" y2="9"></line>
            <line x1="14" y1="15" x2="14" y2="9"></line>
          </>
        ),
      },
      {
        kpi: "foundationInProgress",
        of: "foundationPhase",
        label: "Foundation Course In Progress",
        tooltip: "Candidates currently progressing through the Foundation Course.",
        accent: "tealCard",
        icon: (
          <>
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </>
        ),
      },
      {
        kpi: "foundationCompleted",
        of: "foundationPhase",
        label: "Foundation Course Completed",
        tooltip: "Candidates who completed the Foundation Course.",
        accent: "tealCard",
        icon: (
          <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </>
        ),
      },
    ],
  },
  {
    title: "Ground Truth Module",
    cards: [
      {
        kpi: "groundTruthModule",
        of: "foundationCompleted",
        label: "Candidates in Ground Truth Module",
        tooltip: "Foundation Course completers who are now in the Ground Truth Module.",
        accent: "indigoCard",
        icon: (
          <>
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
            <circle cx="12" cy="12" r="2"></circle>
          </>
        ),
      },
      {
        kpi: "groundTruthNotStarted",
        of: "groundTruthModule",
        label: "Ground Truth Module Not Started",
        tooltip: "Candidates who reached the Ground Truth Module but have not started it yet.",
        accent: "indigoCard",
        icon: (
          <>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="10" y1="15" x2="10" y2="9"></line>
            <line x1="14" y1="15" x2="14" y2="9"></line>
          </>
        ),
      },
      {
        kpi: "groundTruthInProgress",
        of: "groundTruthModule",
        label: "Ground Truth Module In Progress",
        tooltip: "Candidates currently progressing through the Ground Truth Module.",
        accent: "indigoCard",
        icon: (
          <>
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </>
        ),
      },
      {
        kpi: "groundTruthCompleted",
        of: "groundTruthModule",
        label: "Ground Truth Module Completed",
        tooltip: "Candidates who completed the Ground Truth Module.",
        accent: "indigoCard",
        icon: (
          <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </>
        ),
      },
    ],
  },
  {
    title: "Documents & Final Selection",
    cards: [
      {
        kpi: "documentsPhase",
        of: "groundTruthCompleted",
        label: "Candidates in Document Phase",
        tooltip: "Ground Truth completers who are now in the Documents stage.",
        accent: "slateCard",
        icon: (
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </>
        ),
      },
      {
        kpi: "documentsSubmitted",
        of: "documentsPhase",
        label: "Documents Successfully Submitted",
        tooltip: "Candidates who successfully submitted their required documents.",
        accent: "slateCard",
        icon: (
          <>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <polyline points="9 15 11 17 15 13"></polyline>
          </>
        ),
      },
      {
        kpi: "selectedOnboarded",
        of: "documentsSubmitted",
        label: "Selected / Onboarded",
        tooltip: "Candidates who submitted their documents and were selected/onboarded by the admin.",
        accent: "greenCard",
        icon: (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <polyline points="17 11 19 13 23 9"></polyline>
          </>
        ),
      },
    ],
  },
] as const;

const TOOLTIP_PLACEMENTS = ["above", "below", "right", "left"] as const;
type TooltipPlacement = (typeof TOOLTIP_PLACEMENTS)[number];
const TOOLTIP_GAP = 8;

type FunnelCard = (typeof FUNNEL_CARDS)[number] | (typeof STAGE_ROWS)[number]["cards"][number];

// KPI modals that list interview attempts (the rest show phone / joined date / phase)
const ATTEMPT_KPIS = new Set(["attendedInterview", "passedInterview", "failedInterview", "reattempted", "totalPass", "totalFail"]);

// Display format for every date in the Analytics tab: "DD Mon YYYY" (e.g. 03 Oct 2026).
// Built from en-US parts because en-IN/en-GB render September as "Sept".
const displayDateFormat = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" });
const formatDisplayDate = (value: string | null | undefined) => {
  const date = value ? new Date(value) : null;
  if (!date || isNaN(date.getTime())) return "Unknown";
  const parts = Object.fromEntries(displayDateFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}`;
};

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
  const [kpiModalRole, setKpiModalRole] = useState("All");



  const fetchKpiModalData = async (type: string, st: string, dist: string, role: string) => {
    setKpiModalLoading(true);
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { "X-Admin-Token": token } : {};
      const query = new URLSearchParams({ kpi: type });
      if (st !== "All") query.append("state", st);
      if (dist !== "All") query.append("district", dist);
      if (role !== "All") query.append("role", role);
      // The modal has no date inputs of its own; it lists the KPI section's registration-date range
      if (kpiStartDate) query.append("start_date", kpiStartDate);
      if (kpiEndDate) query.append("end_date", kpiEndDate);

      const res = await fetch(`${adminApiBase}/api/admin/stats/kpi-details?` + query.toString(), { headers, credentials: "include" });
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

  // The modal opens on the KPI section's filters so its list matches the clicked card's count
  const openKpiModal = (type: string, title: string, st = "All", dist = "All", role = "All") => {
    setKpiModalType(type);
    setKpiModalTitle(title);
    setKpiModalOpen(true);
    setKpiModalState(st);
    setKpiModalDistrict(dist);
    setKpiModalRole(role);
    // A changed filter is fetched by the modal filter effect below; fetch here only when it won't fire
    if (st === kpiModalState && dist === kpiModalDistrict && role === kpiModalRole) fetchKpiModalData(type, st, dist, role);
  };



  useEffect(() => {
    if (kpiModalOpen) {
      fetchKpiModalData(kpiModalType, kpiModalState, kpiModalDistrict, kpiModalRole);
    }
  }, [kpiModalState, kpiModalDistrict, kpiModalRole]);

  // Independent Filters
  const [kpiState, setKpiState] = useState<string>("All");
  const [kpiDistrict, setKpiDistrict] = useState<string>("All");
  const [kpiRole, setKpiRole] = useState<string>("All");
  // Registration-date range (YYYY-MM-DD), same semantics as the Detailed Candidate Report's dates
  const [kpiStartDate, setKpiStartDate] = useState("");
  const [kpiEndDate, setKpiEndDate] = useState("");
  const kpiStatsRequestId = useRef(0);
  const kpiSectionRef = useRef<HTMLDivElement>(null);
  const [kpiTooltip, setKpiTooltip] = useState<{ kpi: string; placement: TooltipPlacement }>({ kpi: "", placement: "above" });

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
  }, [kpiState, kpiDistrict, kpiStartDate, kpiEndDate, kpiRole]);

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
        if (kpiState === "All" && kpiDistrict === "All" && kpiRole === "All" && !kpiStartDate && !kpiEndDate) {
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
    const requestId = ++kpiStatsRequestId.current;
    if (kpiState === "All" && kpiDistrict === "All" && kpiRole === "All" && !kpiStartDate && !kpiEndDate && globalStats) {
      setKpiStats(globalStats);
      return;
    }
    try {
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { "X-Admin-Token": token } : {};
      const url = new URL(`${adminApiBase}/api/admin/stats/overview`);
      if (kpiState !== "All") url.searchParams.append("state", kpiState);
      if (kpiDistrict !== "All") url.searchParams.append("district", kpiDistrict);
      if (kpiRole !== "All") url.searchParams.append("role", kpiRole);
      if (kpiStartDate) url.searchParams.append("start_date", kpiStartDate);
      if (kpiEndDate) url.searchParams.append("end_date", kpiEndDate);

      const res = await fetch(url.toString(), { headers });
      // With four filters, an older slower response must not overwrite the latest one
      if (res.ok && requestId === kpiStatsRequestId.current) setKpiStats(await res.json());
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

  const kpiModalDistricts = useMemo(() => getAvailableDistricts(kpiModalState), [geoStats, kpiModalState]);

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
    { name: "Passed", value: phaseStats?.funnel?.passedInterview || 0 },
    { name: "Course", value: phaseStats?.byPhase?.foundation || 0 },
    { name: "Module", value: phaseStats?.byPhase?.module || 0 },
    { name: "Failed", value: phaseStats?.funnel?.failedInterview || 0 },
  ];

  // Tooltips open above their card unless that would cover a KPI heading (the row titles sit just above the cards)
  // or leave the viewport; then they try below, right and left, in that order.
  const placeKpiTooltip = (cardEl: HTMLElement, kpi: string) => {
    const tip = cardEl.querySelector<HTMLElement>("[role='tooltip']");
    if (!tip || !kpiSectionRef.current) return;
    const card = cardEl.getBoundingClientRect();
    const w = card.width;
    const h = tip.offsetHeight;
    const midY = card.top + card.height / 2;
    const rects: Record<TooltipPlacement, { left: number; right: number; top: number; bottom: number }> = {
      above: { left: card.left, right: card.right, top: card.top - TOOLTIP_GAP - h, bottom: card.top - TOOLTIP_GAP },
      below: { left: card.left, right: card.right, top: card.bottom + TOOLTIP_GAP, bottom: card.bottom + TOOLTIP_GAP + h },
      right: { left: card.right + TOOLTIP_GAP, right: card.right + TOOLTIP_GAP + w, top: midY - h / 2, bottom: midY + h / 2 },
      left: { left: card.left - TOOLTIP_GAP - w, right: card.left - TOOLTIP_GAP, top: midY - h / 2, bottom: midY + h / 2 },
    };
    const headings = Array.from(kpiSectionRef.current.querySelectorAll("[data-kpi-heading]")).map((el) => el.getBoundingClientRect());
    const viewportWidth = document.documentElement.clientWidth;
    const placement = TOOLTIP_PLACEMENTS.find((p) => {
      const r = rects[p];
      const fits = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= viewportWidth;
      return fits && !headings.some((hd) => r.left < hd.right && r.right > hd.left && r.top < hd.bottom && r.bottom > hd.top);
    }) ?? "above";
    setKpiTooltip({ kpi, placement });
  };

  const renderKpiCard = (card: FunnelCard) => {
    const count = kpiStats?.funnel?.[card.kpi] || 0;
    const total = "of" in card ? kpiStats?.funnel?.[card.of] || 0 : null;
    const tooltipId = `kpi-tooltip-${card.kpi}`;
    return (
      <button
        key={card.kpi}
        type="button"
        className={`${styles.kpiCard} ${styles[card.accent]}`}
        aria-describedby={tooltipId}
        data-tooltip-placement={kpiTooltip.kpi === card.kpi ? kpiTooltip.placement : "above"}
        onMouseEnter={(e) => placeKpiTooltip(e.currentTarget, card.kpi)}
        onFocus={(e) => placeKpiTooltip(e.currentTarget, card.kpi)}
        onClick={() => openKpiModal(card.kpi, card.label, kpiState, kpiDistrict, kpiRole)}
      >
        <span className={styles.kpiHeader}>
          <span className={styles.kpiIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {card.icon}
            </svg>
          </span>
          <span className={styles.kpiLabel}>{card.label}</span>
        </span>
        <span className={styles.kpiValue}>
          {count}
          {total !== null && <span className={styles.kpiValueTotal}> / {total}</span>}
        </span>
        <span role="tooltip" id={tooltipId} className={styles.kpiTooltip}>{card.tooltip}</span>
      </button>
    );
  };

  if (loading) {
    return (
      <div className={styles.dashboardContainer}>
        <div className={styles.kpiGrid} style={{ marginBottom: '24px' }}>
          {FUNNEL_CARDS.map((card) => (
            <div key={card.kpi} className={styles.skeletonBox} style={{ height: '112px', borderRadius: '8px' }} />
          ))}
        </div>
        {STAGE_ROWS.map((row) => (
          <div key={row.title} className={styles.kpiStageGrid} data-cols={row.cards.length} style={{ marginBottom: '24px' }}>
            {row.cards.map((card) => (
              <div key={card.kpi} className={styles.skeletonBox} style={{ height: '112px', borderRadius: '8px' }} />
            ))}
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className={styles.skeletonBox} style={{ height: '300px', borderRadius: '12px' }} />
          <div className={styles.skeletonBox} style={{ height: '300px', borderRadius: '12px' }} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.kpiContainer} ref={kpiSectionRef}>
        <div className={`${styles.chartHeaderSpace} ${styles.kpiHeaderRow}`}>
          <h2 className={styles.sectionTitle} data-kpi-heading>KPI OVERVIEW CARDS</h2>
          <div className={`${styles.filters} ${styles.kpiFilters}`}>
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
            <label>Select Role:</label>
            <select value={kpiRole} onChange={(e) => setKpiRole(e.target.value)}>
              <option value="All">All</option>
              <option value="Intern">Intern</option>
              <option value="YP">YP</option>
              <option value="Junior">Junior</option>
              <option value="Agri">Agri</option>
              <option value="Senior">Senior</option>
            </select>
            <label htmlFor="kpi-start-date">Start Date:</label>
            <input id="kpi-start-date" type="date" value={kpiStartDate} max={kpiEndDate || undefined} onChange={(e) => setKpiStartDate(e.target.value)} />
            <label htmlFor="kpi-end-date">End Date:</label>
            <input id="kpi-end-date" type="date" value={kpiEndDate} min={kpiStartDate || undefined} onChange={(e) => setKpiEndDate(e.target.value)} />
          </div>
        </div>
        <div className={styles.kpiGrid}>
          {FUNNEL_CARDS.map(renderKpiCard)}
        </div>
        {STAGE_ROWS.map((row) => (
          <div key={row.title} className={styles.kpiStageRow}>
            <h3 className={styles.kpiRowTitle} data-kpi-heading>{row.title}</h3>
            {/* Each row keeps its own column count (4, 4, 3) */}
            <div className={styles.kpiStageGrid} data-cols={row.cards.length}>
              {row.cards.map(renderKpiCard)}
            </div>
          </div>
        ))}
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
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>{kpiModalTitle}</h2>
                {(kpiStartDate || kpiEndDate) && (
                  <div style={{ marginTop: '4px', fontSize: '0.8125rem', color: '#64748b' }}>
                    Registered {kpiStartDate ? `from ${formatDisplayDate(`${kpiStartDate}T00:00:00`)}` : ""}
                    {kpiStartDate && kpiEndDate ? " " : ""}
                    {kpiEndDate ? `through ${formatDisplayDate(`${kpiEndDate}T00:00:00`)}` : ""} (UTC)
                  </div>
                )}
              </div>
              <button onClick={() => setKpiModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <select value={kpiModalState} onChange={(e) => { setKpiModalState(e.target.value); setKpiModalDistrict("All"); }} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                <option value="All">All States</option>
                {uniqueStates.map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {kpiModalState !== "All" && (
                <select value={kpiModalDistrict} onChange={(e) => setKpiModalDistrict(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                  <option value="All">All Districts</option>
                  {kpiModalDistricts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
              <select value={kpiModalRole} onChange={(e) => setKpiModalRole(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                <option value="All">All Roles</option>
                <option value="Intern">Intern</option>
                <option value="YP">YP</option>
                <option value="Junior">Junior</option>
                <option value="Agri">Agri</option>
                <option value="Senior">Senior</option>
              </select>
            </div>

            {kpiModalLoading ? (
              <div style={{ textAlign: 'center', padding: '24px' }}>Loading...</div>
            ) : kpiModalData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#666' }}>No candidates found for this KPI.</div>
            ) : (
              <table className={`${styles.table} ${styles.kpiModalTable}`}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>State</th>
                    {ATTEMPT_KPIS.has(kpiModalType) ? (
                      <>
                        <th className={styles.attemptCountCol}>Total Attempts</th>
                        <th className={styles.attemptDateCol}>Date</th>
                        <th className={styles.attemptResultCol}>Result</th>
                        <th className={styles.attemptScoreCol}>Score</th>
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
                      {ATTEMPT_KPIS.has(kpiModalType) ? (
                        <>
                          <td className={styles.attemptCountCol}>{cand.total_attempts}</td>
                          {cand.attempts && cand.attempts.length > 0 ? (
                            <>
                              {/* Same layout as the Detailed Candidate Report: one aligned line per attempt */}
                              <td className={styles.attemptDateCol}>
                                {cand.attempts.map((att: any, idx: number) => (
                                  <div key={idx} className={styles.attemptLine}>{formatDisplayDate(att.date)}</div>
                                ))}
                              </td>
                              <td className={styles.attemptResultCol}>
                                {cand.attempts.map((att: any, idx: number) => (
                                  <div key={idx} className={styles.attemptLine}>{att.result || 'PENDING'}</div>
                                ))}
                              </td>
                              <td className={styles.attemptScoreCol}>
                                {cand.attempts.map((att: any, idx: number) => (
                                  <div key={idx} className={styles.attemptLine}>{(typeof att.score === 'number' ? att.score : 0).toFixed(1)}</div>
                                ))}
                              </td>
                            </>
                          ) : (
                            <td colSpan={3}>No details</td>
                          )}
                        </>
                      ) : kpiModalType === 'totalSelected' ? (
                        <>
                          <td>{formatDisplayDate(cand.created_at)}</td>
                          <td>{formatDisplayDate(cand.documents_submitted_at)}</td>
                          <td>Yes</td>
                        </>
                      ) : (
                        <>
                          <td>{cand.phone}</td>
                          <td>{formatDisplayDate(cand.created_at)}</td>
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
