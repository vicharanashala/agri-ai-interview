"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { createPoller, isAbortError, startPolling, type Poller } from "../../../lib/polling";
import styles from "./dashboard.module.css";
import { serialNumber } from "@/lib/serial-number";
import { useRouter, useSearchParams } from "next/navigation";

import LiveTab from "../../../components/admin/LiveTab";
import EvaluationsTab from "../../../components/admin/EvaluationsTab";
import OfferLetterTab from "../../../components/admin/OfferLetterTab";
import DocumentsTab from "../../../components/admin/DocumentsTab";
import CandidateDocumentActions from "../../../components/admin/CandidateDocumentActions";
import CourseCompletionTab from "../../../components/admin/CourseCompletionTab";
import ModuleCompletionTab from "../../../components/admin/ModuleCompletionTab";
import PageSelector from "../../../components/admin/PageSelector";
import AnalyticsTab from "../../../components/admin/AnalyticsTab";
import FeedbacksTab from "../../../components/admin/FeedbacksTab";

// Types
interface Candidate {
  isSelected?: boolean;
  isNotJoined?: boolean;
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
  candidateState?: string;
  candidateDistrict?: string;
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
type Tab = "live" | "candidates" | "analytics" | "evaluations" | "course-completion" | "module-completion" | "anti-cheat" | "documents" | "feedbacks" | "trash" | "settings";
type SettingsTab = "guidelines" | "criteria" | "interview-config" | "anti-cheat" | "offer-letter";

// Dashboard view state is mirrored in the URL (?tab=&q=&phase=&state=&district=&interview=&page=&limit=)
// so returning from a candidate profile restores the same tab, filters and page.
const TABS: Tab[] = ["live", "candidates", "analytics", "evaluations", "course-completion", "module-completion", "anti-cheat", "documents", "feedbacks", "trash", "settings"];
const PAGE_LIMITS = [10, 20, 50, 100];
const POLL_INTERVAL_MS = 5000;
const ANTI_CHEAT_POLL_INTERVAL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 300;
// Set when a profile is opened from the table, so the profile's back button can use browser history
const PROFILE_OPENED_FROM_DASHBOARD_KEY = "admin_profile_opened_from_dashboard";

// Chart colors
const CHART_COLORS = ["#08CB00", "#10b981", "#f59e0b", "#ef4444", "#059669", "#22c55e"];

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  interview: "Interview",
  summary: "Summary",
  foundation: "Foundation Course",
    module: "Ground Truth Module",
    documents: "Documents",
};

// Points to the Next.js rewrite proxy so the browser talks to a single origin.
// In Docker, this resolves to the Next.js server; locally it falls back to the
// direct backend URL for development outside Docker.
const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

// useSearchParams() needs a Suspense boundary for this statically rendered page
export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Loading...</div>}>
      <AdminDashboard />
    </Suspense>
  );
}

function AdminDashboard() {
  const router = useRouter();
  // Read the query through the router: on client-side navigation (e.g. back from a candidate profile)
  // window.location still holds the previous URL while this component first renders.
  const searchParams = useSearchParams();

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

  const [initialQuery] = useState(() => new URLSearchParams(searchParams.toString()));
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = initialQuery.get("tab");
    return tab && TABS.includes(tab as Tab) ? (tab as Tab) : "live";
  });
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("guidelines");
  const [adminData, setAdminData] = useState<{ name: string; email: string } | null>(null);

  // Data states
  const [activeInterviews, setActiveInterviews] = useState<ActiveInterview[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [guidelines, setGuidelines] = useState<Guidelines[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriteria[]>([]);

  // UI states
  const [selectedInterview, setSelectedInterview] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; candidateId: string } | null>(null);
  const [deletingCandidate, setDeletingCandidate] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<string | null>(null);
  const [candidateMarkedNotice, setCandidateMarkedNotice] = useState<string | null>(null);
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
  const [violations, setViolations] = useState<any[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(false);
  // State filter options; filled from the geo stats the Analytics tab loads
  const [uniqueStates, setUniqueStates] = useState<string[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState(() => initialQuery.get("q") || "");
  // The search text the candidates request uses; follows searchQuery after a typing pause
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [phaseFilter, setPhaseFilter] = useState<string>(() => initialQuery.get("phase") || "");
  const [stateFilter, setStateFilter] = useState<string>(() => initialQuery.get("state") || "");
  const [interviewStatusFilter, setInterviewStatusFilter] = useState<string>(() => initialQuery.get("interview") || "");
  const [districtFilter, setDistrictFilter] = useState<string>(() => initialQuery.get("district") || "");
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
        // Wipe stale live-interview cache so the UI never shows outdated sessions
        setActiveInterviews([]);
      } catch {
        router.push("/admin/login");
      }
    };
    verifyAndLoad();
  }, [router]);

  // Tab data loads only after the session is verified. Analytics, Evaluations, Course Completion and
  // Module Completion load their own data; Candidates/Trash, Live and Anti-Cheat have effects below.
  const authed = adminData !== null;

  // On narrow screens the tab bar scrolls sideways; bring the active tab into view (horizontally only)
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = tabsRef.current;
    const active = strip?.querySelector<HTMLElement>(`.${styles.activeTab}`);
    if (!strip || !active) return;
    const s = strip.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.left < s.left || a.right > s.right) strip.scrollLeft += a.left - s.left - (s.width - a.width) / 2;
  }, [activeTab, authed]);

  useEffect(() => {
    if (!authed || activeTab !== "settings") return;
    const controller = new AbortController();
    loadGuidelines(controller.signal);
    loadCriteria(controller.signal);
    loadInterviewConfig(controller.signal);
    loadAntiCheatConfig(controller.signal);
    return () => controller.abort();
  }, [authed, activeTab]);

  // Live interviews: load on entry, then refresh every 5s without overlapping, paused while the page is hidden
  const activeInterviewsJsonRef = useRef("[]");
  useEffect(() => {
    if (!authed || activeTab !== "live") return;
    return startPolling({ run: loadActiveInterviews, intervalMs: POLL_INTERVAL_MS, immediate: true });
  }, [authed, activeTab]);

  const loadActiveInterviews = async (signal: AbortSignal) => {
    try {
      const res = await withAuth("/api/admin/interviews/active", { signal });
      if (res.ok) {
        const interviews = (await res.json()).interviews || [];
        // Unchanged polls skip the state update, so the dashboard does not re-render every 5s
        const json = JSON.stringify(interviews);
        if (json !== activeInterviewsJsonRef.current) {
          activeInterviewsJsonRef.current = json;
          setActiveInterviews(interviews);
        }
      }
    } catch (err) {
      if (!isAbortError(err)) console.error("Failed to load active interviews:", err);
    }
  };

  const [candidatesTotal, setCandidatesTotal] = useState(0);
  const [candidatesPage, setCandidatesPage] = useState(() => {
    const page = parseInt(initialQuery.get("page") || "", 10); // 1-based in the URL
    return page > 1 ? page - 1 : 0;
  });
  const [candidatesLimit, setCandidatesLimit] = useState(() => {
    const limit = parseInt(initialQuery.get("limit") || "", 10);
    return PAGE_LIMITS.includes(limit) ? limit : 10;
  });

  const handleDeleteCandidate = async (candidateId: string) => {
    setDeletingCandidate(true);
    setDeleteConfirmModal(null);
    setContextMenu(null);
    try {
      const res = await withAuth(`/api/admin/candidates/${candidateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete candidate");
      }
      // Reload candidates
      reloadCandidates();
    } catch (err) {
      console.error(err);
      alert("Error deleting candidate");
    } finally {
      setDeletingCandidate(false);
    }
  };

      const handleToggleSelectedCandidate = async (candidateId: string) => {
    setContextMenu(null);
    try {
      const res = await withAuth(`/api/admin/candidates/${candidateId}/mark-selected`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to update candidate status");
      }
      reloadCandidates();
    } catch (err) {
      console.error(err);
      alert("Error updating candidate status");
    }
  };

  const handleRestoreCandidate = async (candidateId: string) => {
    setDeletingCandidate(true);
    setContextMenu(null);
    try {
      const res = await withAuth(`/api/admin/candidates/${candidateId}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to restore candidate");
      }
      reloadCandidates();
    } catch (err) {
      console.error(err);
      alert("Error restoring candidate");
    } finally {
      setDeletingCandidate(false);
    }
  };

  const [candidatesLoading, setCandidatesLoading] = useState(true);
  // Bumped to refetch the current page (after an action, or Search / Enter)
  const [candidatesReloadKey, setCandidatesReloadKey] = useState(0);
  const reloadCandidates = () => setCandidatesReloadKey((n) => n + 1);

  // The candidates query for the current filters and tab
  const candidatesParams = (limit: number, offset: number) => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (phaseFilter) params.append("phase", phaseFilter);
    if (stateFilter) params.append("state", stateFilter);
    if (districtFilter) params.append("district", districtFilter);
    if (interviewStatusFilter) params.append("interviewStatus", interviewStatusFilter);
    if (activeTab === "trash") params.append("status", "trash");
    params.append("limit", limit.toString());
    params.append("offset", offset.toString());
    return params;
  };

  // Apply typed search text after a pause, so each keystroke does not send a request
  useEffect(() => {
    if (searchQuery === debouncedSearch) return;
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const applySearchNow = (query: string) => {
    setSearchQuery(query);
    setDebouncedSearch(query);
  };

  // Changed filters go back to the first page. Compared against the last seen filters (not "first run") so
  // the initial mount — and StrictMode's re-run of it — keep a page number restored from the URL.
  const filterKey = JSON.stringify([phaseFilter, stateFilter, districtFilter, interviewStatusFilter, debouncedSearch, candidatesLimit]);
  const lastFilterKeyRef = useRef(filterKey);
  // The tab the candidates table last loaded for; entering a tab shows the skeleton, refetches keep the rows
  const candidatesTabRef = useRef<Tab | null>(null);

  useEffect(() => {
    if (!authed || (activeTab !== "candidates" && activeTab !== "trash")) {
      candidatesTabRef.current = null;
      return;
    }
    if (lastFilterKeyRef.current !== filterKey) {
      lastFilterKeyRef.current = filterKey;
      if (candidatesPage !== 0) {
        setCandidatesPage(0); // re-runs this effect for the first page
        return;
      }
    }
    if (candidatesTabRef.current !== activeTab) {
      candidatesTabRef.current = activeTab;
      setCandidatesLoading(true);
    }

    const params = candidatesParams(candidatesLimit, candidatesPage * candidatesLimit);

    // A newer tab, filter or page aborts this request, so a slow older response never replaces newer rows
    const controller = new AbortController();
    (async () => {
      try {
        const res = await withAuth(`/api/admin/candidates?${params}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setCandidates(data.candidates || []);
          setCandidatesTotal(data.total || 0);
        }
      } catch (err) {
        if (!isAbortError(err)) console.error("Failed to load candidates:", err);
      } finally {
        if (!controller.signal.aborted) setCandidatesLoading(false);
      }
    })();
    return () => controller.abort();
  }, [authed, activeTab, filterKey, candidatesPage, candidatesReloadKey]);

  // Course and Module Completion keep the All Candidates tab count current; one row is enough to read the total
  useEffect(() => {
    if (!authed || (activeTab !== "course-completion" && activeTab !== "module-completion")) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await withAuth(`/api/admin/candidates?${candidatesParams(1, 0)}`, { signal: controller.signal });
        if (res.ok) setCandidatesTotal((await res.json()).total || 0);
      } catch (err) {
        if (!isAbortError(err)) console.error("Failed to load candidates count:", err);
      }
    })();
    return () => controller.abort();
  }, [authed, activeTab, candidatesReloadKey]);

  const buildDashboardQuery = () => {
    const params = new URLSearchParams();
    if (activeTab !== "live") params.set("tab", activeTab);
    if (searchQuery) params.set("q", searchQuery);
    if (phaseFilter) params.set("phase", phaseFilter);
    if (stateFilter) params.set("state", stateFilter);
    if (districtFilter) params.set("district", districtFilter);
    if (interviewStatusFilter) params.set("interview", interviewStatusFilter);
    if (candidatesPage > 0) params.set("page", String(candidatesPage + 1));
    if (candidatesLimit !== 10) params.set("limit", String(candidatesLimit));
    return params.toString();
  };

  // Mirror tab, filters and page into the URL without adding history entries. Passing `null` (not
  // Next's own history state) lets the App Router adopt the new URL, so it is not reverted later.
  useEffect(() => {
    if (window.location.pathname !== "/admin/dashboard") return;
    const qs = buildDashboardQuery();
    const url = `/admin/dashboard${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", url);
    }
  }, [activeTab, searchQuery, phaseFilter, stateFilter, districtFilter, interviewStatusFilter, candidatesPage, candidatesLimit]);

  // A state filter restored from the URL needs its district options
  useEffect(() => {
    if (stateFilter) loadDistrictsForState(stateFilter);
  }, []);

  const openCandidateProfile = (e: React.MouseEvent | React.KeyboardEvent, candidateId: string) => {
    if (contextMenu) return; // this click only dismisses the open context menu
    if (window.getSelection()?.toString()) return; // admin is selecting text in the row
    const path = `/admin/candidates/${encodeURIComponent(candidateId)}`;
    // ?from= carries this view so the profile can link back to it (also from a new tab or after reload)
    const href = `${path}?from=${encodeURIComponent(buildDashboardQuery())}`;
    if (e.ctrlKey || e.metaKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    try {
      sessionStorage.setItem(PROFILE_OPENED_FROM_DASHBOARD_KEY, path);
    } catch {
      // Storage unavailable — the profile's back button navigates via ?from= instead
    }
    router.push(href);
  };

  useEffect(() => {
    if (!candidateMarkedNotice) return;
    const timer = setTimeout(() => setCandidateMarkedNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [candidateMarkedNotice]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const [violationsTotal, setViolationsTotal] = useState(0);
  const [violationsPage, setViolationsPage] = useState(0);
  const [violationsLimit, setViolationsLimit] = useState(10);
  const [violationsSearch, setViolationsSearch] = useState("");
  const [debouncedViolationsSearch, setDebouncedViolationsSearch] = useState("");

  // A new search applies after a typing pause and starts from the first page
  useEffect(() => {
    if (violationsSearch === debouncedViolationsSearch) return;
    const timer = setTimeout(() => {
      setDebouncedViolationsSearch(violationsSearch);
      setViolationsPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [violationsSearch]);

  // The skeleton shows only when the page, page size or search changes; background refreshes update rows in place
  const loadViolations = async (signal: AbortSignal, showSkeleton: boolean) => {
    if (showSkeleton) setViolationsLoading(true);
    try {
      const offset = violationsPage * violationsLimit;
      const search = debouncedViolationsSearch.trim();
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      const res = await withAuth(`/api/admin/anti-cheat/violations?limit=${violationsLimit}&offset=${offset}${searchParam}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setViolations(data.violations || []);
        setViolationsTotal(data.total || 0);
      }
    } catch (err) {
      if (!isAbortError(err)) console.error("Failed to load violations:", err);
    } finally {
      if (showSkeleton && !signal.aborted) setViolationsLoading(false);
    }
  };

  // Background refreshes pause while the search box is focused; focus/blur pause and resume the running poller
  // rather than restarting it, so they never add a request or a second interval
  const violationsSearchInputRef = useRef<HTMLInputElement>(null);
  const violationsPollerRef = useRef<Poller | null>(null);

  // Restarted for each page, page size or search, which aborts the request for the previous one
  useEffect(() => {
    if (!authed || activeTab !== "anti-cheat") return;
    const poller = createPoller({
      run: loadViolations,
      intervalMs: ANTI_CHEAT_POLL_INTERVAL_MS,
      immediate: true,
      // A search applied while typing restarts polling; it stays paused until the box loses focus
      paused: document.activeElement === violationsSearchInputRef.current,
    });
    violationsPollerRef.current = poller;
    return () => {
      poller.stop();
      if (violationsPollerRef.current === poller) violationsPollerRef.current = null;
    };
  }, [authed, activeTab, violationsPage, violationsLimit, debouncedViolationsSearch]);

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

  const loadGuidelines = async (signal?: AbortSignal) => {
    try {
      const res = await withAuth("/api/admin/settings/guidelines", { signal });
      if (res.ok) {
        const data = await res.json();
        setGuidelines(data.guidelines || []);
      }
    } catch (err) {
      if (!isAbortError(err)) console.error("Failed to load guidelines:", err);
    }
  };

  const loadCriteria = async (signal?: AbortSignal) => {
    try {
      const res = await withAuth("/api/admin/settings/evaluation", { signal });
      if (res.ok) {
        const data = await res.json();
        setCriteria(data.criteria || []);
      }
    } catch (err) {
      if (!isAbortError(err)) console.error("Failed to load criteria:", err);
    }
  };

  const loadInterviewConfig = async (signal?: AbortSignal) => {
    try {
      const res = await withAuth("/api/admin/settings/interview", { signal });
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
      if (!isAbortError(err)) console.error("Failed to load interview config:", err);
    }
  };

  const loadAntiCheatConfig = async (signal?: AbortSignal) => {
    try {
      const res = await withAuth("/api/admin/settings/anti-cheat", { signal });
      if (res.ok) {
        const data = await res.json();
        setAntiCheatConfig(data);
        setIdleThresholdInput(Math.round((data.idle_threshold_ms ?? 15000) / 1000));
        setPlatformIdleInput(Math.round((data.platform_idle_ms ?? 900000) / 60000));
      }
    } catch (err) {
      if (!isAbortError(err)) console.error("Failed to load anti-cheat config:", err);
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



  if (!adminData) {
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
          <button
            type="button"
            className={`${styles.settingsIconBtn} ${activeTab === "settings" ? styles.settingsIconBtnActive : ""}`}
            onClick={() => setActiveTab("settings")}
            title="Settings"
            aria-label="Settings"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
        </div>
      </header>



      {/* Tabs */}
      <div className={styles.tabs} ref={tabsRef}>
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
          className={`${styles.tab} ${activeTab === "module-completion" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("module-completion")}
        >
          📋 Module Completion
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
          className={`${styles.tab} ${activeTab === "feedbacks" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("feedbacks")}
        >
          💬 Feedbacks
        </button>
        <button className={`${styles.tab} ${activeTab === "trash" ? styles.activeTab : ""}`} onClick={() => setActiveTab("trash")}>🗑️ Trash</button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Live Interviews Tab */}
        {activeTab === "live" && (
          <LiveTab
            interviews={activeInterviews}
            selectedId={selectedInterview}
            onSelect={setSelectedInterview}
            adminToken={getAdminToken()}
            adminApiBase={ADMIN_API_BASE}
            onNavigateToCandidates={(stateName) => {
              if (stateName) setStateFilter(stateName);
              setActiveTab("candidates");
            }}
          />
        )}

        {/* Candidates Tab */}
        {(activeTab === "candidates" || activeTab === "trash") && (
          <div className={styles.candidatesContainer}>
            {/* Filters */}
            <div className={styles.filters}>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applySearchNow(searchQuery);
                    reloadCandidates();
                  }
                }}
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
                {/* A state restored from the URL before the state list has loaded */}
                {stateFilter && !uniqueStates.includes(stateFilter) && (
                  <option value={stateFilter}>{stateFilter}</option>
                )}
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
              <button
                onClick={() => {
                  applySearchNow(searchQuery);
                  setCandidatesPage(0);
                  reloadCandidates();
                }}
                className={styles.searchBtn}
              >
                Search
              </button>

            </div>

            {/* Candidates Table */}
            {candidatesLoading ? (
                <div className={styles.candidatesTable}>
                  <table>
                    <thead>
                      <tr>
                        <th className={styles.serialCol}>S. No.</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>State</th>
                        <th>Current Phase</th>
                        <th>Phase Progress</th>
                        <th>Created</th>
                        <th className={styles.actionCol}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: candidatesLimit }).map((_, i) => (
                        <tr key={i}>
                          <td className={styles.serialCol}><div className={styles.skeletonBox} style={{ width: 20, height: 16 }} /></td>
                          <td><div className={styles.skeletonBox} style={{ width: 120, height: 16 }} /></td>
                          <td><div className={styles.skeletonBox} style={{ width: 150, height: 16 }} /></td>
                          <td><div className={styles.skeletonBox} style={{ width: 100, height: 16 }} /></td>
                          <td><div className={styles.skeletonBox} style={{ width: 80, height: 16 }} /></td>
                          <td><div className={styles.skeletonBox} style={{ width: 100, height: 24, borderRadius: 12 }} /></td>
                          <td><div className={styles.skeletonBox} style={{ width: 120, height: 12, borderRadius: 6 }} /></td>
                          <td><div className={styles.skeletonBox} style={{ width: 100, height: 16 }} /></td>
                          <td className={styles.actionCol}><div className={styles.skeletonBox} style={{ width: 230, height: 30, borderRadius: 6 }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            ) : candidates.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No candidates found</p>
              </div>
            ) : (
              <>
                <div className={styles.candidatesTable}>
                  <table>
                    <thead>
                      <tr>
                        <th className={styles.serialCol}>S. No.</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>State</th>
                        <th>Current Phase</th>
                        <th>Phase Progress</th>
                        <th>Created</th>
                        <th className={styles.actionCol}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((candidate, i) => (
                        <tr
                          key={candidate.id}
                          className={styles.clickableRow}
                          tabIndex={0}
                          title="Open candidate profile"
                          onClick={(e) => openCandidateProfile(e, candidate.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.target === e.currentTarget) openCandidateProfile(e, candidate.id);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, candidateId: candidate.id });
                          }}
                        >
                          <td className={styles.serialCol}>{serialNumber(candidatesPage, candidatesLimit, i)}</td>
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
                          <td>{candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</td>
                          <td className={styles.actionCol}>
                            <CandidateDocumentActions
                              centered
                              candidate={{ ...candidate, isDeleted: activeTab === "trash" }}
                              adminFetch={withAuth}
                              onError={(message) => alert(message)}
                              onUpdated={(patch) =>
                                setCandidates((prev) => prev.map((c) => (c.id === candidate.id ? { ...c, ...patch } : c)))
                              }
                              onMarked={setCandidateMarkedNotice}
                            />
                          </td>
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
                  onLimitChange={(l) => { setCandidatesLimit(l); setCandidatesPage(0); }}
                  loading={candidatesLoading}
                />
              </>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <AnalyticsTab
            adminApiBase={ADMIN_API_BASE}
            getAdminToken={getAdminToken}
            onGeoStatsLoaded={(data) => setUniqueStates(data.uniqueStates || [])}
          />
        )}

        {/* Evaluations Tab */}
        {activeTab === "evaluations" && (
          <EvaluationsTab
            adminApiBase={ADMIN_API_BASE}
            getAdminToken={getAdminToken}
            onCandidateClick={(query) => {
              applySearchNow(query);
              setActiveTab("candidates");
            }}
          />
        )}

        {/* Course Completion Tab */}
        {activeTab === "course-completion" && (
          <CourseCompletionTab
            adminToken={getAdminToken()}
            adminApiBase={ADMIN_API_BASE}
            onRefreshCandidates={reloadCandidates}
          />
        )}

        {/* Module Completion Tab */}
        {activeTab === "module-completion" && (
          <ModuleCompletionTab
            adminToken={getAdminToken()}
            adminApiBase={ADMIN_API_BASE}
            onRefreshCandidates={reloadCandidates}
          />
        )}

        {/* Anti-Cheat Tab */}
        {activeTab === "anti-cheat" && (
          <div className={styles.antiCheatContainer}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
              <h2 className={styles.antiCheatTitle} style={{ margin: 0 }}>🛡️ Anti-Cheat Violations</h2>
              <input
                type="text"
                placeholder="Search by name or email..."
                ref={violationsSearchInputRef}
                value={violationsSearch}
                onChange={e => setViolationsSearch(e.target.value)}
                onFocus={() => violationsPollerRef.current?.pause()}
                onBlur={() => violationsPollerRef.current?.resume()}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', width: '250px', maxWidth: '100%' }}
              />
            </div>
            {violationsLoading ? (
              <div className={styles.violationsTable}>
                <table>
                  <thead>
                    <tr>
                      <th className={styles.serialCol}>S. No.</th>
                      <th>Candidate</th>
                      <th>Email</th>
                      <th>Violation</th>
                      <th>Severity</th>
                      <th>Auto-Closed</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: violationsLimit }).map((_, i) => (
                      <tr key={i}>
                        <td className={styles.serialCol}><div className={styles.skeletonBox} style={{ width: 20, height: 16 }} /></td>
                        <td><div className={styles.skeletonBox} style={{ width: 120, height: 16 }} /></td>
                        <td><div className={styles.skeletonBox} style={{ width: 150, height: 16 }} /></td>
                        <td><div className={styles.skeletonBox} style={{ width: 200, height: 16 }} /></td>
                        <td><div className={styles.skeletonBox} style={{ width: 60, height: 24, borderRadius: 12 }} /></td>
                        <td><div className={styles.skeletonBox} style={{ width: 40, height: 20 }} /></td>
                        <td><div className={styles.skeletonBox} style={{ width: 140, height: 16 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : violations.length === 0 ? (
              <p className={styles.noDataMessage}>
                {violationsSearch.trim() ? "No violations match your search." : "No violations recorded yet."}
              </p>
            ) : (
              <>
                <div className={styles.violationsTable}>
                  <table>
                    <thead>
                      <tr>
                        <th className={styles.serialCol}>S. No.</th>
                        <th>Candidate</th>
                        <th>Email</th>
                        <th>Violation</th>
                        <th>Severity</th>
                        <th>Auto-Closed</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {violations.map((v: any, i: number) => (
                        <tr key={v.id}>
                          <td className={styles.serialCol}>{serialNumber(violationsPage, violationsLimit, i)}</td>
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
                  onLimitChange={(l) => { setViolationsLimit(l); setViolationsPage(0); }}
                  loading={violationsLoading}
                />
              </>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <DocumentsTab
            adminToken={getAdminToken()}
            adminApiBase={ADMIN_API_BASE}
            onMarked={setCandidateMarkedNotice}
          />
        )}

        {/* Feedbacks Tab */}
        {activeTab === "feedbacks" && (
          <FeedbacksTab
            adminToken={getAdminToken()}
            adminApiBase={ADMIN_API_BASE}
          />
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
                    
                    {/* Four columns on desktop; fewer as the screen narrows */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
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
                    After {idleThresholdInput}s of no activity during interview ? 1st warning. Same trigger again ? interview closed. Default: 15s.
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

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            // Kept on screen when opened near the right or bottom edge (e.g. on a phone)
            top: Math.max(0, Math.min(contextMenu.y, window.innerHeight - 60)),
            left: Math.max(0, Math.min(contextMenu.x, window.innerWidth - 160)),
            background: 'white',
            border: '1px solid #ccc',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 9999,
            padding: '8px 0',
            borderRadius: '4px',
            minWidth: '150px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
                                {activeTab === "trash" ? (
            <button
              style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#006400', fontWeight: 'bold', fontSize: '14px' }}
              onClick={() => handleRestoreCandidate(contextMenu.candidateId)}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d4edda'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                <polyline points="9 11 12 8 15 11"></polyline>
                <line x1="12" y1="8" x2="12" y2="14"></line>
                <path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2a9.938 9.938 0 0 1 7.07 2.93L22 8"></path>
                <line x1="16" y1="8" x2="22" y2="8"></line>
                <line x1="22" y1="2" x2="22" y2="8"></line>
              </svg>
              Restore
            </button>
                          ) : (
                <>
                  
            <button
              style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#9c0606', fontWeight: 'bold', fontSize: '14px' }}
              onClick={() => {
                setDeleteConfirmModal(contextMenu.candidateId);
                setContextMenu(null);
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8d7da'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              Remove
            </button>
              </>
            )}
        </div>
      )}

      {deleteConfirmModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "16px",
            zIndex: 10000
          }}
          onClick={() => setDeleteConfirmModal(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "8px",
              padding: "24px",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#800000', display: 'flex', alignItems: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              Confirm Removal
            </h3>
            <p style={{ margin: "0 0 24px 0", lineHeight: "1.5", color: "#333" }}>
              Are you sure you want to completely remove this candidate? This will delete all their data including interviews and documents. This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setDeleteConfirmModal(null)} 
                style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ccc', background: 'white', cursor: 'pointer' }}
                disabled={deletingCandidate}
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteConfirmModal && handleDeleteCandidate(deleteConfirmModal)} 
                style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#800000', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                disabled={deletingCandidate}
              >
                {deletingCandidate ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {candidateMarkedNotice && (
        <div
          role="status"
          style={{
            position: "fixed",
            right: "16px",
            bottom: "16px",
            maxWidth: "min(420px, calc(100vw - 32px))",
            padding: "12px 16px",
            borderRadius: "8px",
            background: "#d1fae5",
            border: "1px solid #6ee7b7",
            color: "#065f46",
            fontSize: "14px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10001
          }}
        >
          {candidateMarkedNotice}
        </div>
      )}
    </div>
  );
}