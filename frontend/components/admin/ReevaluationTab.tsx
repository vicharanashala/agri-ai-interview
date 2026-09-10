'use client';

import React, { useState, useEffect } from "react";
import styles from "./ReevaluationTab.module.css";

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

export interface ReEvaluationItem {
  id: string;
  interviewId: string;
  candidateId: string;
  candidateName: string;
  email?: string;
  result?: string;       // PASS | FAIL
  endReason?: string;    // anti_cheat | withdrawn | question_limit | time_limit
  score?: number;        // 0–100
  attempt: number;       // 1-indexed
  requestedAt?: string;  // Re-evaluation requested date
  completedAt?: string;  // Interview attended date
  reason: string;        // Candidate's provided reason
  status: string;        // pending | completed
  messages: ChatMessage[];
  evaluation?: Evaluation;
}

interface ReevaluationTabProps {
  adminApiBase: string;
  getAdminToken: () => string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
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

// ─── Expanded Row Component ──────────────────────────────────────────

function ExpandedRow({
  item,
  adminApiBase,
  getAdminToken,
  onReevaluate,
}: {
  item: ReEvaluationItem;
  adminApiBase: string;
  getAdminToken: () => string | null;
  onReevaluate: (interviewId: string, newScore: number, newResult: string, evaluation?: Evaluation) => void;
}) {
  const [reevaluating, setReevaluating] = useState(false);

  const handleReevaluate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (reevaluating) return;
    setReevaluating(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${adminApiBase}/api/admin/interviews/${item.interviewId}/reevaluate`, {
        method: "POST",
        headers: token ? { "X-Admin-Token": token } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        onReevaluate(item.interviewId, data.score, data.result, data.evaluation);
        alert(`Re-evaluation completed successfully! New Score: ${data.score}/100 (${data.result})`);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Re-evaluation failed: ${errData.detail || "Server error"}`);
      }
    } catch (err) {
      alert(`Network error during re-evaluation: ${err}`);
    } finally {
      setReevaluating(false);
    }
  };

  return (
    <tr className={styles.expandedRow}>
      <td colSpan={9} className={styles.expandedCell}>
        <div
          style={{
            background: "#fef3c7",
            borderBottom: "1px solid #fde68a",
            padding: "12px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <span style={{ fontWeight: 700, color: "#92400e", fontSize: "13px" }}>
              💬 Candidate Reason for Re-evaluation:
            </span>
            <p style={{ margin: "4px 0 0", color: "#78350f", fontSize: "13px", fontStyle: "italic" }}>
              &quot;{item.reason}&quot;
            </p>
          </div>
          <button
            onClick={handleReevaluate}
            disabled={reevaluating}
            style={{
              padding: "8px 18px",
              fontSize: "13px",
              background: reevaluating ? "#9ca3af" : "#f59e0b",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: reevaluating ? "not-allowed" : "pointer",
              fontWeight: 600,
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              whiteSpace: "nowrap",
            }}
          >
            {reevaluating ? "Re-evaluating…" : "🔄 Re-evaluate Now"}
          </button>
        </div>

        <div className={styles.expandedContent}>
          {/* Left: chat history */}
          <div className={styles.expandedLeft}>
            <div className={styles.sectionHeader}>💬 Interview Chat History</div>
            <ChatHistory messages={item.messages} />
          </div>

          {/* Right: evaluation */}
          <div className={styles.expandedRight}>
            <div className={styles.sectionHeader}>📊 Current Evaluation Report</div>
            {item.evaluation ? (
              <EvaluationDetail eval_={item.evaluation} />
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

export default function ReevaluationTab({ adminApiBase, getAdminToken }: ReevaluationTabProps) {
  const [reEvaluations, setReEvaluations] = useState<ReEvaluationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReEvaluations = async () => {
    setLoading(true);
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
        setReEvaluations(data.reEvaluations || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load re-evaluations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReEvaluations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => fetchReEvaluations();
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSearch(); };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleReevaluate = (interviewId: string, newScore: number, newResult: string, evaluation?: Evaluation) => {
    setReEvaluations(prev =>
      prev.map(e =>
        e.interviewId === interviewId ? { ...e, score: newScore, result: newResult, evaluation: evaluation ?? e.evaluation } : e
      )
    );
  };

  return (
    <div className={styles.container}>
      {/* Filters */}
      <div className={styles.filters}>
        <input
          type="text"
          placeholder="Search by candidate name or email..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        <button onClick={handleSearch} className={styles.searchBtn}>Search</button>
        <span className={styles.totalCount}>{total} requests</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className={styles.loading}>Loading re-evaluation requests…</div>
      ) : reEvaluations.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔄</div>
          <h3>No Re-evaluation Requests</h3>
          <p>Candidate requests for interview re-evaluation will appear here</p>
        </div>
      ) : (
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
                <th>Requested Date</th>
                <th>Attended Date</th>
                <th>Candidate Reason</th>
              </tr>
            </thead>
            <tbody>
              {reEvaluations.map(item => (
                <React.Fragment key={item.id}>
                  <tr
                    className={`${styles.row} ${expandedId === item.id ? styles.rowExpanded : ""}`}
                    onClick={() => toggleExpand(item.id)}
                  >
                    <td>
                      <span className={styles.expandIcon}>
                        {expandedId === item.id ? "▼" : "▶"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.candidateCell}>
                        <span className={styles.candidateName}>{item.candidateName}</span>
                        {item.email && (
                          <span className={styles.candidateEmail}>{item.email}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.resultBadge} ${resultClass(item.result)}`}>
                        {resultBadge(item.result)}
                      </span>
                    </td>
                    <td>
                      {item.score != null ? (
                        <div className={styles.scoreCell}>
                          <span className={styles.scoreNum} style={{ color: item.result === 'PASS' ? '#4ade80' : '#f87171' }}>
                            {item.score}
                          </span>
                          <span className={styles.scoreMax}>/100</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td>
                      <span className={styles.endReasonBadge}>{endReasonLabel(item.endReason)}</span>
                    </td>
                    <td>
                      <span className={styles.attemptBadge}>{item.attempt}/{3}</span>
                    </td>
                    <td>
                      <span className={styles.dateCell}>{formatDate(item.requestedAt)}</span>
                    </td>
                    <td>
                      <span className={styles.dateCell}>{formatDate(item.completedAt)}</span>
                    </td>
                    <td>
                      <span className={styles.reasonText}>
                        {item.reason.length > 40 ? item.reason.slice(0, 40) + "…" : item.reason}
                      </span>
                    </td>
                  </tr>
                  {expandedId === item.id && (
                    <ExpandedRow
                      item={item}
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
      )}
    </div>
  );
}
