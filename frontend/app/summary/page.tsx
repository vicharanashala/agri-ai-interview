'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';
import { interceptAuthFetch } from '@/lib/auth-fetch';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max

interface AttemptItem {
  interviewId: string;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  score?: number;
  endReason?: string;
  reEvaluation: {
    requested: boolean;
    reason?: string;
    requestedAt?: string;
    status?: string; // pending | completed
    scoreAfter?: number;
    resultAfter?: string;
    completedAt?: string;
  };
}

export default function SummaryPage() {
  const [activeSummaryTab, setActiveSummaryTab] = useState<'result' | 'history'>('result');
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [cooldownDays, setCooldownDays] = useState<number>(0);
  const [phaseSynced, setPhaseSynced] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  // Attempt History & Re-evaluation Modal state
  const [attemptsHistory, setAttemptsHistory] = useState<AttemptItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showReEvalModal, setShowReEvalModal] = useState(false);
  const [targetInterviewId, setTargetInterviewId] = useState<string | null>(null);
  const [inputReason, setInputReason] = useState("");
  const [submittingReEval, setSubmittingReEval] = useState(false);
  const [reEvalMsg, setReEvalMsg] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const router = useRouter();

  const fetchAttemptsHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/candidate/attempts-history', {
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setAttemptsHistory(data.attempts || []);
      }
    } catch { /* non-fatal */ } finally {
      setLoadingHistory(false);
    }
  };

  const openReEvalModal = (interviewId: string) => {
    setTargetInterviewId(interviewId);
    setInputReason("");
    setReEvalMsg(null);
    setShowReEvalModal(true);
  };

  const handleSubmitReEval = async () => {
    if (!inputReason.trim() || inputReason.trim().length < 5) {
      setReEvalMsg("Please enter at least 5 characters for your reason.");
      return;
    }
    setSubmittingReEval(true);
    setReEvalMsg(null);
    try {
      const res = await fetch('/api/candidate/re-evaluation-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token') || ''}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          interview_id: targetInterviewId || undefined,
          reason: inputReason.trim()
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowReEvalModal(false);
        fetchAttemptsHistory();
      } else {
        setReEvalMsg(data.detail || data.message || "Failed to submit request.");
      }
    } catch {
      setReEvalMsg("Failed to submit request. Please try again.");
    } finally {
      setSubmittingReEval(false);
    }
  };

  // ── Polling logic ────────────────────────────────────────────────────
  const startPolling = (interviewId: string) => {
    setEvaluating(true);
    pollStartRef.current = Date.now();

    pollTimerRef.current = setInterval(async () => {
      // Timeout after 5 minutes
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        clearPolling();
        setEvalError('Evaluation is taking longer than expected. Please refresh the page in a few minutes.');
        setEvaluating(false);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/interview/evaluation/${interviewId}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Poll request failed');

        const data = await res.json();

        if (data.status === 'ready') {
          clearPolling();
          setResult(data.result);
          setScore(data.overall_score ?? null);
          setEndReason(data.end_reason ?? null);
          localStorage.setItem('interviewResult', data.result ?? '');
          localStorage.setItem('interviewScore', String(data.overall_score ?? ''));
          if (data.evaluation) {
            localStorage.setItem('interviewEvaluation', JSON.stringify(data.evaluation));
          }
          await syncPhaseToDb(data.result === 'PASS' ? 4 : 3);
          setEvaluating(false);
          setLoading(false);
        } else if (data.status === 'error') {
          clearPolling();
          setResult('FAIL');
          setScore(0);
          setEvaluating(false);
          setLoading(false);
        }
      } catch {
        // Non-fatal — keep polling
      }
    }, POLL_INTERVAL_MS);
  };

  const clearPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // ── Main load effect ────────────────────────────────────────────────
  useEffect(() => {
    const restore = interceptAuthFetch();
    fetchAttemptsHistory();

    const justCompleted =
      sessionStorage.getItem('interviewJustCompleted') === 'true' ||
      localStorage.getItem('interviewJustCompleted') === 'true';

    if (justCompleted) {
      const closingId =
        localStorage.getItem('closingInterviewId') ||
        sessionStorage.getItem('closingInterviewId') ||
        '';

      sessionStorage.removeItem('interviewJustCompleted');
      localStorage.removeItem('interviewJustCompleted');
      sessionStorage.removeItem('closingInterviewId');
      localStorage.removeItem('closingInterviewId');
      localStorage.setItem('summaryVisited', 'true');

      if (closingId) {
        startPolling(closingId);
      } else {
        (async () => {
          try {
            const res = await fetch('/api/candidate/attempts', {
              credentials: 'include',
              cache: 'no-store',
              headers: {
                Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token') || ''}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              const latest = data.attempts?.[0];
              if (latest?.result) {
                setResult(latest.result);
                setScore(latest.overall_score ?? null);
                localStorage.setItem('interviewResult', latest.result ?? '');
                localStorage.setItem('interviewScore', String(latest.overall_score ?? ''));
                if (latest.result === 'PASS') await syncPhaseToDb(4);
                setEvaluating(false);
                setLoading(false);
                return;
              }
            }
          } catch { /* non-fatal */ }
          setEvaluating(false);
          setLoading(false);
        })();
      }

      (async () => {
        try {
          const res = await fetch('/api/candidate/attempts', {
            credentials: 'include',
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token') || ''}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.cooldownDays) setCooldownDays(data.cooldownDays);
          }
        } catch { /* non-fatal */ }
      })();
    } else {
      (async () => {
        try {
          const res = await fetch('/api/candidate/attempts', {
            credentials: 'include',
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token') || ''}`,
            },
          });
          if (res.ok) {
            const data = await res.json();
            const latest = data.attempts?.[0];
            if (latest) {
              setResult(latest.result);
              setScore(latest.overall_score ?? null);
              localStorage.setItem('interviewResult', latest.result ?? '');
              localStorage.setItem('interviewScore', String(latest.overall_score ?? ''));
            }
            if (data.cooldownDays) setCooldownDays(data.cooldownDays);
          }
        } catch {
          const storedResult = localStorage.getItem('interviewResult');
          const storedScore = localStorage.getItem('interviewScore');
          if (storedResult) setResult(storedResult);
          if (storedScore) setScore(Number(storedScore));
        } finally {
          if (localStorage.getItem('interviewResult') === 'PASS') {
            await syncPhaseToDb(4);
          }
          setPhaseSynced(true);
          setLoading(false);
        }
      })();
    }

    return () => { clearPolling(); restore(); };
  }, []);

  const formatEndReason = (reason: string | null): string => {
    switch (reason) {
      case 'anti_cheat': return 'Interview closed due to anti-cheat policy violation';
      case 'withdrawn': return 'Interview ended by candidate (voluntary withdrawal)';
      case 'question_limit': return 'Interview ended after reaching the question limit';
      case 'time_limit': return 'Interview ended after the time limit was reached';
      case 'evaluation_complete': return 'Interview ended — evaluation complete';
      default: return 'Interview ended';
    }
  };

  if (loading || evaluating) {
    return (
      <main className={styles.container}>
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            {evaluating && <div className={styles.spinner} />}
            {evaluating ? (
              <>
                <p className={styles.evaluatingTitle}>Interview is getting evaluated...</p>
                <p className={styles.evaluatingSubtitle}>
                  Results will be shared on this page. You can also check your dashboard.
                </p>
              </>
            ) : (
              <p>Loading results...</p>
            )}
            <button
              className={styles.dashboardBtn}
              onClick={() => router.push('/dashboard')}
              style={{ marginTop: '24px' }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (evalError) {
    return (
      <main className={styles.container}>
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <p className={styles.evalError}>{evalError}</p>
            <button
              className={styles.dashboardBtn}
              onClick={() => router.push('/dashboard')}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isPass = result === 'PASS';
  const hasResult = result !== null;

  return (
    <main className={styles.container}>
      <div className={styles.content}>
        {/* Navigation Sub-Tabs */}
        <div className={styles.navTabs}>
          <button
            className={`${styles.navTabBtn} ${activeSummaryTab === 'result' ? styles.activeNavTabBtn : ''}`}
            onClick={() => setActiveSummaryTab('result')}
          >
            📊 Current Result
          </button>
          <button
            className={`${styles.navTabBtn} ${activeSummaryTab === 'history' ? styles.activeNavTabBtn : ''}`}
            onClick={() => setActiveSummaryTab('history')}
          >
            🔄 Attempt History & Re-evaluations ({attemptsHistory.length})
          </button>
        </div>

        {/* Tab 1: Current Result View (100% UNTOUCHED ORIGINAL UI) */}
        {activeSummaryTab === 'result' && (
          <>
            <div className={styles.resultSection}>
              {hasResult ? (
                <div
                  className={styles.resultBadge}
                  style={{
                    backgroundColor: isPass ? '#22c55e' : '#ef4444',
                    color: 'white',
                  }}
                >
                  {isPass ? '✓ PASSED' : '✗ FAILED'}
                </div>
              ) : (
                <div className={styles.resultBadge} style={{ backgroundColor: '#6b7280', color: 'white' }}>
                  Results are being generated...
                </div>
              )}

              {score !== null && hasResult && (
                <p className={styles.scoreText}>Score: {score}/100</p>
              )}
            </div>

            {isPass && (
              <div className={styles.passMessage}>
                <p>Congratulations on passing the interview!</p>
                <p>Please complete the Foundation Course to proceed.</p>
              </div>
            )}

            {result === 'FAIL' && (
              <div className={styles.failSection}>
                {endReason && (
                  <p className={styles.endReasonText}>{formatEndReason(endReason)}</p>
                )}

                {cooldownDays > 0 ? (
                  <div className={styles.cooldownBanner}>
                    <p className={styles.cooldownLabel}>Cooldown in effect</p>
                    <p className={styles.cooldownValue}>{cooldownDays} days cooldown</p>
                    <p className={styles.cooldownHint}>
                      You cannot re-attempt until the cooldown period ends.
                    </p>
                  </div>
                ) : (
                  <div className={styles.cooldownBanner}>
                    <p className={styles.cooldownLabel}>No active cooldown</p>
                    <p className={styles.cooldownHint}>
                      You may be able to re-attempt — check your dashboard for details.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className={styles.actions}>
              <button
                onClick={() => router.push('/dashboard')}
                className={styles.dashboardBtn}
                disabled={!phaseSynced}
                style={!phaseSynced ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
              >
                {!phaseSynced ? 'Syncing...' : 'Go to Dashboard'}
              </button>
            </div>
          </>
        )}

        {/* Tab 2: Attempt History & Re-evaluations View */}
        {activeSummaryTab === 'history' && (
          <div className={styles.historyList}>
            {loadingHistory ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>Loading attempts history...</p>
            ) : attemptsHistory.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>No previous attempt records found.</p>
            ) : (
              attemptsHistory.map(item => (
                <div key={item.interviewId} className={styles.historyCard}>
                  <div className={styles.historyCardHeader}>
                    <span className={styles.attemptTitle}>Attempt {item.attempt}</span>
                    <span className={styles.attemptDate}>
                      {item.completedAt ? new Date(item.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                  </div>

                  <div className={styles.historyCardBody}>
                    <div>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: item.result === 'PASS' ? '#dcfce7' : '#fee2e2',
                          color: item.result === 'PASS' ? '#15803d' : '#b91c1c',
                        }}
                      >
                        {item.result === 'PASS' ? '✓ PASS' : '✗ FAIL'}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, color: '#334155', fontSize: '14px' }}>
                      Score: {item.score != null ? `${item.score}/100` : '—'}
                    </div>
                  </div>

                  {/* Re-evaluation Status / Action for this attempt */}
                  <div style={{ marginTop: '8px' }}>
                    {item.reEvaluation?.requested ? (
                      item.reEvaluation.status === 'completed' ? (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px' }}>
                          <span style={{ fontWeight: 700, color: '#166534', fontSize: '12.5px' }}>
                            ✅ Re-evaluation Completed
                          </span>
                          <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '12px' }}>
                            Updated Score: {item.reEvaluation.scoreAfter}/100 ({item.reEvaluation.resultAfter})
                          </p>
                        </div>
                      ) : (
                        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px' }}>
                          <span style={{ fontWeight: 700, color: '#92400e', fontSize: '12.5px' }}>
                            🔄 Re-evaluation Requested
                          </span>
                          <p style={{ margin: '2px 0 0', color: '#78350f', fontSize: '12px', fontStyle: 'italic' }}>
                            &quot;{item.reEvaluation.reason}&quot;
                          </p>
                        </div>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => openReEvalModal(item.interviewId)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          background: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        🔄 Request Re-evaluation for Attempt {item.attempt}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            <div className={styles.actions} style={{ marginTop: '16px' }}>
              <button
                onClick={() => router.push('/dashboard')}
                className={styles.dashboardBtn}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Dialog for Candidate Re-evaluation Reason */}
      {showReEvalModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3>Request Interview Re-evaluation</h3>
            <p className={styles.modalSubtext}>
              Please provide a detailed reason why you are requesting a re-evaluation of your interview performance.
            </p>
            <textarea
              className={styles.modalTextarea}
              rows={4}
              placeholder="Explain why you feel your score or evaluation requires re-examination..."
              value={inputReason}
              onChange={(e) => setInputReason(e.target.value)}
            />
            {reEvalMsg && (
              <p className={styles.modalError}>{reEvalMsg}</p>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={() => setShowReEvalModal(false)}
                disabled={submittingReEval}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalSubmitBtn}
                onClick={handleSubmitReEval}
                disabled={submittingReEval}
              >
                {submittingReEval ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}