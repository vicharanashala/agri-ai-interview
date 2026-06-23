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
}

interface EvaluationsTabProps {
  adminApiBase: string;
  getAdminToken: () => string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
      {/* Summary card */}
      <div className={styles.detailCard} style={{ gridColumn: "1 / -1" }}>
        <div className={styles.detailCardHeader}>📋 LLM Evaluation Summary</div>
        {eval_.summary && <p className={styles.evalSummary}>"{eval_.summary}"</p>}
        {eval_.recommendation && (
          <p className={styles.evalRec}>
            <strong>Recommendation:</strong> {eval_.recommendation}
          </p>
        )}
      </div>

      {/* Metrics */}
      {eval_.metrics && Object.keys(eval_.metrics).length > 0 && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardHeader}>📊 Scoring Criteria</div>
          {Object.entries(eval_.metrics).map(([name, metric]) => (
            <MetricRow key={name} name={name} metric={metric} />
          ))}
        </div>
      )}

      {/* Topic scores */}
      {eval_.topic_scores && Object.keys(eval_.topic_scores).length > 0 && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardHeader}>🗂️ Topic Scores</div>
          {Object.entries(eval_.topic_scores).map(([name, metric]) => (
            <MetricRow key={name} name={name} metric={metric} />
          ))}
        </div>
      )}

      {/* Strengths */}
      {eval_.strengths && eval_.strengths.length > 0 && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardHeader}>💪 Strengths</div>
          <ul className={styles.bulletList}>
            {eval_.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Areas for improvement */}
      {eval_.areas_for_improvement && eval_.areas_for_improvement.length > 0 && (
        <div className={styles.detailCard}>
          <div className={styles.detailCardHeader}>📚 Areas for Improvement</div>
          <ul className={styles.bulletList}>
            {eval_.areas_for_improvement.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Expanded Row ────────────────────────────────────────────────────

function ExpandedRow({
  evaluation,
  adminApiBase,
  getAdminToken,
  onReevaluate,
}: {
  evaluation: InterviewEvaluation;
  adminApiBase: string;
  getAdminToken: () => string | null;
  onReevaluate: (id: string, newScore: number, newResult: string, evaluation?: Evaluation) => void;
}) {
  const [reevaluating, setReevaluating] = useState(false);
  const [resettingCooldown, setResettingCooldown] = useState(false);

  const handleReevaluate = async () => {
    if (!confirm(`Re-evaluate interview for ${evaluation.candidateName}? This will update their score and result.`)) return;
    setReevaluating(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${adminApiBase}/api/admin/interviews/${evaluation.id}/reevaluate`, {
        method: "POST",
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        onReevaluate(evaluation.id, data.overall_score, data.result, data.evaluation);
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
    if (!confirm(`Reset cooldown for ${evaluation.candidateName}? They will be able to start a new interview immediately.`)) return;
    setResettingCooldown(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${adminApiBase}/api/admin/candidates/${evaluation.candidateId}/reset-cooldown`, {
        method: "POST",
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        alert(`Cooldown reset for ${evaluation.candidateName}. They can now start a new interview.`);
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
      <td colSpan={7} className={styles.expandedCell}>
        {/* Action buttons bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "12px" }}>
          {evaluation.result === "FAIL" && (
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

        <div className={styles.expandedContent}>
          {/* Left: chat history */}
          <div className={styles.expandedLeft}>
            <div className={styles.sectionHeader}>💬 Interview Chat History</div>
            <ChatHistory messages={evaluation.messages} />
          </div>

          {/* Right: evaluation */}
          <div className={styles.expandedRight}>
            <div className={styles.sectionHeader}>📊 Evaluation Report</div>
            {evaluation.evaluation ? (
              <EvaluationDetail eval_={evaluation.evaluation} />
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
  const [evaluations, setEvaluations] = useState<InterviewEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [resultFilter, setResultFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const fetchEvaluations = async (resetPage = false) => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(resetPage ? 0 : page * LIMIT) });
      if (resultFilter) params.set("result", resultFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`${adminApiBase}/api/admin/interviews/evaluations?${params}`, {
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

  useEffect(() => {
    fetchEvaluations(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultFilter]);

  const handleSearch = () => fetchEvaluations(true);
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
        e.id === id ? { ...e, score: newScore, result: newResult, evaluation: evaluation ?? e.evaluation } : e
      )
    );
  };

  const filtered = evaluations; // filtering is server-side; client-side search is supplemental

  return (
    <div className={styles.container}>
      {/* Filters */}
      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        <select
          value={resultFilter}
          onChange={e => setResultFilter(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="">All Results</option>
          <option value="PASS">PASS</option>
          <option value="FAIL">FAIL</option>
        </select>
        <button onClick={handleSearch} className={styles.searchBtn}>Search</button>
        <span className={styles.totalCount}>{total} total</span>
      </div>

      {/* Table */}
      {loading && evaluations.length === 0 ? (
        <div className={styles.loading}>Loading evaluations…</div>
      ) : evaluations.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📋</div>
          <h3>No Evaluations Yet</h3>
          <p>Completed interview evaluations will appear here</p>
        </div>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Candidate</th>
                  <th>Result</th>
                  <th>Score</th>
                  <th>End Reason</th>
                  <th>Attempt</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map(evaluation => (
                  <React.Fragment key={evaluation.id}>
                    <tr
                      className={`${styles.row} ${expandedId === evaluation.id ? styles.rowExpanded : ""}`}
                      onClick={() => toggleExpand(evaluation.id)}
                    >
                      <td>
                        <span className={styles.expandIcon}>
                          {expandedId === evaluation.id ? "▼" : "▶"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.candidateCell}>
                          <span className={styles.candidateName}>{evaluation.candidateName}</span>
                          {evaluation.email && (
                            <span className={styles.candidateEmail}>{evaluation.email}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.resultBadge} ${resultClass(evaluation.result)}`}>
                          {resultBadge(evaluation.result)}
                        </span>
                      </td>
                      <td>
                        {evaluation.score != null ? (
                          <div className={styles.scoreCell}>
                            <span className={styles.scoreNum} style={{ color: scoreColor(evaluation.score) }}>
                              {evaluation.score}
                            </span>
                            <span className={styles.scoreMax}>/100</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td>
                        <span className={styles.endReasonBadge}>{endReasonLabel(evaluation.endReason)}</span>
                      </td>
                      <td>
                        <span className={styles.attemptBadge}>{evaluation.attempt}/{3}</span>
                      </td>
                      <td>
                        <span className={styles.dateCell}>{formatDate(evaluation.completedAt)}</span>
                      </td>
                    </tr>
                    {expandedId === evaluation.id && (
                      <ExpandedRow
                        evaluation={evaluation}
                        adminApiBase={adminApiBase}
                        getAdminToken={getAdminToken}
                        onReevaluate={handleReevaluate}
                      />
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {evaluations.length < total && (
            <div className={styles.loadMore}>
              <button onClick={handleLoadMore} className={styles.loadMoreBtn}>
                Load More ({total - evaluations.length} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}