'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max

export default function SummaryPage() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [cooldownDays, setCooldownDays] = useState<number>(0);
  const [phaseSynced, setPhaseSynced] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const router = useRouter();

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
        // else: still pending — keep polling
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
    const justCompleted =
      sessionStorage.getItem('interviewJustCompleted') === 'true' ||
      localStorage.getItem('interviewJustCompleted') === 'true';

    if (justCompleted) {
      // ── First load after interview end ────────────────────────────────
      // Clear flags
      sessionStorage.removeItem('interviewJustCompleted');
      localStorage.removeItem('interviewJustCompleted');
      sessionStorage.removeItem('closingInterviewId');
      localStorage.removeItem('closingInterviewId');

      // Get interview_id from localStorage (set by endInterviewAndClose)
      const closingId =
        localStorage.getItem('closingInterviewId') ||
        sessionStorage.getItem('closingInterviewId') ||
        '';

      // Mark summary visited
      localStorage.setItem('summaryVisited', 'true');

      // Poll for evaluation results
      if (closingId) {
        startPolling(closingId);
      } else {
        // No interview ID — try to get from DB via attempts endpoint
        (async () => {
          try {
            const res = await fetch('/api/candidate/attempts', {
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

      // Fetch cooldown info in background
      (async () => {
        try {
          const res = await fetch('/api/candidate/attempts', {
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

      // Don't setLoading(false) here — let polling set it when done/error
      // Keep loading=true until results arrive
    } else {
      // ── Subsequent visit: read from DB ──────────────────────────────
      (async () => {
        try {
          const res = await fetch('/api/candidate/attempts', {
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
          // non-fatal — fall back to localStorage
          const storedResult = localStorage.getItem('interviewResult');
          const storedScore = localStorage.getItem('interviewScore');
          if (storedResult) setResult(storedResult);
          if (storedScore) setScore(Number(storedScore));
        } finally {
          // Sync phase if PASS — backend already updated currentPhase to 'documents'
          if (localStorage.getItem('interviewResult') === 'PASS') {
            await syncPhaseToDb(4);
          }
          setPhaseSynced(true);
          setLoading(false);
        }
      })();
    }

    return () => clearPolling();
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

  // ── Loading / Evaluating state ────────────────────────────────────
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

  // ── Error state (eval timeout) ─────────────────────────────────────
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

  // ── Result display ─────────────────────────────────────────────────
  const isPass = result === 'PASS';
  const hasResult = result !== null;

  return (
    <main className={styles.container}>
      <div className={styles.content}>
        {/* Pass/Fail Badge — only show once result is available */}
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

        {/* PASS path */}
        {isPass && (
          <div className={styles.passMessage}>
            <p>Congratulations on passing the interview!</p>
            <p>Please upload the required documents to complete your application.</p>
          </div>
        )}

        {/* FAIL path — cooldown info */}
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
      </div>
    </main>
  );
}