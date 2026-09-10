'use client';

import React, { useState, useEffect } from "react";
import styles from "./EvaluationsTab.module.css";

// ─── Types ──────────────────────────────────────────────────────────

interface ChatMessage {
  role: string;
  content: string;
  timestamp?: string;
}

interface EvaluationMetric {
  score: number;
  details: string;
}

interface Evaluation {
  overall_score?: number;
  metrics?: Record<string, EvaluationMetric>;
  topic_scores?: Record<string, EvaluationMetric>;
  summary?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  recommendation?: string;
}

export interface InterviewEvaluation {
  id: string;
  candidateId: string;
  candidateName: string;
  email?: string;
  result?: string;       // PASS | FAIL
  endReason?: string;    // anti_cheat | withdrawn | question_limit | time_limit
  score?: number;        // 0–100
  startedAt?: string;
  completedAt?: string;
  messages: ChatMessage[];
  evaluation?: Evaluation;
  attempt: number;       // 1-indexed
  reEvaluationRequested?: boolean;
  reEvaluationReason?: string;
  reEvaluationRequestedAt?: string;
}

export interface ReEvaluationItem {
  id: string;
  interviewId: string;
  candidateId: string;
  candidateName: string;
  email?: string;
  result?: string;
  endReason?: string;
  score?: number;
  attempt: number;
  requestedAt?: string;
  completedAt?: string;
  reason: string;
  status: string;        // pending | completed
  scoreAfter?: number;
  resultAfter?: string;
  reEvalCompletedAt?: string;
  messages: ChatMessage[];
  evaluation?: Evaluation;
}

interface EvaluationsTabProps {
  adminApiBase: string;
  getAdminToken: () => string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const cleaned = iso.replace(/\+00:00Z$/, "+00:00").replace(/\+00:00$/, "Z");
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function resultBadge(result?: string): string {
  if (result === "PASS") return "✅ PASS";
  if (result === "FAIL") return "❌ FAIL";
  return "⚪ UNKNOWN";
}

function resultClass(result?: string): string {
  if (result === "PASS") return styles.resultPass;
  if (result === "FAIL") return styles.resultFail;
  return styles.resultUnknown;
}

function endReasonLabel(reason?: string): string {
  const labels: Record<string, string> = {
    anti_cheat: "Anti-Cheat Trigger",
    withdrawn: "Candidate Withdrawn",
    question_limit: "Question Limit Reached",
    time_limit: "Time Limit Exceeded",
    auto: "Auto-completed",
  };
  return labels[reason || ""] || reason || "—";
}

function scoreColor(score?: number): string {
  if (score == null) return "rgba(255,255,255,0.5)";
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#facc15";
  return "#f87171";
}

// ─── Score Bar ───────────────────────────────────────────────────────

function ScoreBar({ score }: { score?: number }) {
  const pct = Math.min(100, Math.max(0, score ?? 0));
  return (
    <div className={styles.scoreBar}>
      <div className={styles.scoreBarFill} style={{ width: `${pct}%`, background: scoreColor(score) }} />
    </div>
  );
}

// ─── Metric Row ──────────────────────────────────────────────────────

function MetricRow({ name, metric }: { name: string; metric?: EvaluationMetric }) {
  const score = metric?.score ?? 0;
  const color = scoreColor(score);
  return (
    <div className={styles.metricRow}>
      <div className={styles.metricName}>{name.replace(/_/g, " ")}</div>
      <div className={styles.metricBar}>
        <ScoreBar score={score} />
      </div>
      <div className={styles.metricScore} style={{ color }}>
        {score}
      </div>
    </div>
  );
}

// ─── Chat History ────────────────────────────────────────────────────

function ChatHistory({ messages }: { messages: ChatMessage[] }) {
  if (!messages || messages.length === 0) {
    return <p className={styles.chatEmpty}>No chat messages recorded.</p>;
  }
  return (
    <div className={styles.chatHistory}>
      {messages.map((msg, idx) => (
        <div key={idx} className={`${styles.chatMsg} ${msg.role === "assistant" ? styles.aiMsg : styles.userMsg}`}>
          <span className={styles.msgRole}>{msg.role === "assistant" ? "AI" : "Candidate"}</span>
          <p className={styles.msgText}>{msg.content}</p>
          {msg.timestamp && (
            <span className={styles.msgTime}>
              {new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Expanded Detail View ────────────────────────────────────────────

function EvaluationDetail({ eval_ }: { eval_: Evaluation }) {
  return (
    <div className={styles.detailGrid}>
      {eval_.summary && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Executive Summary</div>
          <p className={styles.cardText}>{eval_.summary}</p>
        </div>
      )}

      {eval_.metrics && Object.keys(eval_.metrics).length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Competency Breakdown</div>
          {Object.entries(eval_.metrics).map(([key, metric]) => (
            <MetricRow key={key} name={key} metric={metric} />
          ))}
        </div>
      )}

      {eval_.topic_scores && Object.keys(eval_.topic_scores).length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Topic Performance</div>
          {Object.entries(eval_.topic_scores).map(([key, metric]) => (
            <MetricRow key={key} name={key} metric={metric} />
          ))}
        </div>
      )}

      {eval_.strengths && eval_.strengths.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Key Strengths</div>
          <ul className={styles.list}>
            {eval_.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {eval_.areas_for_improvement && eval_.areas_for_improvement.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Areas for Improvement</div>
          <ul className={styles.list}>
            {eval_.areas_for_improvement.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {eval_.recommendation && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Recommendation</div>
          <p className={styles.cardText}>{eval_.recommendation}</p>
        </div>
      )}
    </div>
  );
}

// ─── Unified Expanded Row (Reused for both tables) ───────────────────

function ExpandedRow({
  interviewId,
  candidateId,
  candidateName,
  result,
  messages,
  evaluation,
  adminApiBase,
  getAdminToken,
  onReevaluate,
  reEvaluationReason,
  colSpan = 7,
}: {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  result?: string;
  messages: ChatMessage[];
  evaluation?: Evaluation;
  adminApiBase: string;
  getAdminToken: () => string | null;
  onReevaluate: (id: string, newScore: number, newResult: string, evaluation?: Evaluation) => void;
  reEvaluationReason?: string;
  colSpan?: number;
}) {
  const [reevaluating, setReevaluating] = useState(false);
  const [resettingCooldown, setResettingCooldown] = useState(false);

  const handleReevaluate = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Re-evaluate interview for ${candidateName}? This will update their score and result.`)) return;
    setReevaluating(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${adminApiBase}/api/admin/interviews/${interviewId}/reevaluate`, {
        method: "POST",
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const finalScore = data.overall_score !== undefined ? data.overall_score : (data.new_score ?? data.score);
        const finalResult = data.result !== undefined ? data.result : (data.new_result ?? data.result);
        onReevaluate(interviewId, finalScore, finalResult, data.evaluation);
        alert(`Re-evaluation completed successfully! New Score: ${finalScore}/100 (${finalResult})`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Re-evaluation failed: ${err.detail || res.statusText}`);
      }
    } catch {
      alert("Network error — could not reach server.");
    } finally {
      setReevaluating(false);
    }
  };

  const handleResetCooldown = async () => {
    if (!confirm(`Reset cooldown for ${candidateName}? They will be able to start a new interview immediately.`)) return;
    setResettingCooldown(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${adminApiBase}/api/admin/candidates/${candidateId}/reset-cooldown`, {
        method: "POST",
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        alert(`Cooldown reset for ${candidateName}. They can now start a new interview.`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to reset cooldown: ${err.detail || res.statusText}`);
      }
    } catch {
      alert("Network error — could not reach server.");
    } finally {
      setResettingCooldown(false);
    }
  };

  return (
    <tr className={styles.expandedRow}>
      <td colSpan={colSpan} className={styles.expandedCell}>
        {reEvaluationReason ? (
          <div
            style={{
              background: "#fef3c7",
              borderBottom: "1px solid #fde68a",
              padding: "12px 24px",
            }}
          >
            <span style={{ fontWeight: 700, color: "#92400e", fontSize: "13px" }}>
              💬 Candidate Reason for Re-evaluation:
            </span>
            <p style={{ margin: "4px 0 0", color: "#78350f", fontSize: "13px", fontStyle: "italic" }}>
              &quot;{reEvaluationReason}&quot;
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "12px", padding: "12px 24px 0" }}>
            {result === "FAIL" && (
              <button
                onClick={handleResetCooldown}
                disabled={resettingCooldown}
                style={{
                  padding: "6px 16px",
                  fontSize: "13px",
                  background: resettingCooldown ? "#9ca3af" : "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: resettingCooldown ? "not-allowed" : "pointer",
                  fontWeight: 500,
                }}
              >
                {resettingCooldown ? "Resetting…" : "🔄 Reset Cooldown"}
              </button>
            )}
            <button
              onClick={handleReevaluate}
              disabled={reevaluating}
              style={{
                padding: "6px 16px",
                fontSize: "13px",
                background: reevaluating ? "#9ca3af" : "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: reevaluating ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {reevaluating ? "Re-evaluating…" : "🔄 Re-evaluate"}
            </button>
          </div>
        )}

        <div className={styles.expandedContent}>
          <div className={styles.expandedLeft}>
            <div className={styles.sectionHeader}>💬 Interview Chat History</div>
            <ChatHistory messages={messages} />
          </div>
          <div className={styles.expandedRight}>
            <div className={styles.sectionHeader}>📊 Evaluation Report</div>
            {evaluation ? (
              <EvaluationDetail eval_={evaluation} />
            ) : (
              <p className={styles.noEval}>No evaluation data available.</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function EvaluationsTab({ adminApiBase, getAdminToken }: EvaluationsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'evaluations' | 're-evaluations'>('evaluations');
  const [evaluations, setEvaluations] = useState<InterviewEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [resultFilter, setResultFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);

  // Re-evaluations state
  const [reEvaluations, setReEvaluations] = useState<ReEvaluationItem[]>([]);
  const [reEvalLoading, setReEvalLoading] = useState(false);
  const [reEvalTotal, setReEvalTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [revaluatingIds, setRevaluatingIds] = useState<Set<string>>(new Set());

  const fetchEvaluations = async (resetPage = false) => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const params = new URLSearchParams({ limit: String(limit), offset: String(resetPage ? 0 : page * limit) });
      if (resultFilter) params.set("result", resultFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`${adminApiBase}/api/admin/evaluations?${params}`, {
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setEvaluations(resetPage ? data.evaluations : prev => [...prev, ...data.evaluations]);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to load evaluations:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReEvaluations = async () => {
    setReEvalLoading(true);
    try {
      const token = getAdminToken();
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`${adminApiBase}/api/admin/re-evaluations?${params}`, {
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const items = data.reEvaluations || [];
        setReEvaluations(items);
        setReEvalTotal(data.total || 0);
        setPendingCount(
          data.pendingCount !== undefined
            ? data.pendingCount
            : items.filter((r: ReEvaluationItem) => r.status === "pending").length
        );
      }
    } catch (err) {
      console.error("Failed to load re-evaluations:", err);
    } finally {
      setReEvalLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluations(true);
    fetchReEvaluations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultFilter]);

  const handleSearch = () => {
    fetchEvaluations(true);
    fetchReEvaluations();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSearch(); };

  const handleLoadMore = () => {
    setPage(p => p + 1);
    fetchEvaluations(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleReevaluate = (id: string, newScore: number, newResult: string, evaluation?: Evaluation) => {
    setEvaluations(prev =>
      prev.map(e =>
        e.id === id ? { ...e, score: newScore, result: newResult, reEvaluationRequested: false, evaluation: evaluation ?? e.evaluation } : e
      )
    );
    setPendingCount(prev => Math.max(0, prev - 1));
  };

  const handleReevaluateReEvalItem = (interviewId: string, newScore: number, newResult: string, evaluation?: Evaluation) => {
    setReEvaluations(prev =>
      prev.map(e =>
        e.interviewId === interviewId ? {
          ...e,
          status: 'completed',
          scoreAfter: newScore,
          resultAfter: newResult,
          evaluation: evaluation ?? e.evaluation
        } : e
      )
    );
    setPendingCount(prev => Math.max(0, prev - 1));
    setEvaluations(prev =>
      prev.map(e =>
        e.id === interviewId ? {
          ...e,
          score: newScore,
          result: newResult,
          reEvaluationRequested: false,
          evaluation: evaluation ?? e.evaluation
        } : e
      )
    );
  };

  const handleReevaluateDirect = async (interviewId: string, candidateName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Re-evaluate interview for ${candidateName}? This will run AI evaluation and update their score.`)) return;
    
    setRevaluatingIds(prev => new Set(prev).add(interviewId));
    try {
      const token = getAdminToken();
      const res = await fetch(`${adminApiBase}/api/admin/interviews/${interviewId}/reevaluate`, {
        method: "POST",
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const finalScore = data.overall_score !== undefined ? data.overall_score : (data.new_score ?? data.score);
        const finalResult = data.result !== undefined ? data.result : (data.new_result ?? data.result);
        handleReevaluateReEvalItem(interviewId, finalScore, finalResult, data.evaluation);
        alert(`Re-evaluation completed successfully! Score: ${finalScore}/100 (${finalResult})`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Re-evaluation failed: ${err.detail || "Server error"}`);
      }
    } catch {
      alert("Network error during re-evaluation.");
    } finally {
      setRevaluatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(interviewId);
        return newSet;
      });
    }
  };

  return (
    <div className={styles.container}>
      {/* Filters & Navigation Bar */}
      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        {activeSubTab === 'evaluations' && (
          <select
            value={resultFilter}
            onChange={e => setResultFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All Results</option>
            <option value="PASS">PASS</option>
            <option value="FAIL">FAIL</option>
            <option value="RE_EVALUATION_REQUESTED">Re-evaluation Requested</option>
          </select>
        )}
        <select
          value={limit}
          onChange={e => { setLimit(Number(e.target.value)); fetchEvaluations(true); }}
          className={styles.filterSelect}
          style={{ width: "80px" }}
        >
          {[10, 20, 50, 100, 200].map(n => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
