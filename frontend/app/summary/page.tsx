'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';

interface Attempt {
  id: string;
  status: string;
  result: string | null;
  score: number | null;
}

export default function SummaryPage() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [cooldownDays, setCooldownDays] = useState<number>(0);
  // Track whether phase sync to DB is complete — button is disabled until true
  const [phaseSynced, setPhaseSynced] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // First load = candidate just completed interview (interviewJustCompleted flag is set).
    // Subsequent visits = no flag → candidate returning to summary later (including after a re-evaluation).
    const justCompleted =
      sessionStorage.getItem('interviewJustCompleted') === 'true' ||
      localStorage.getItem('interviewJustCompleted') === 'true';

    if (justCompleted) {
      // ── First load: use localStorage for instant display (no DB round-trip needed) ──
      const storedResult = localStorage.getItem('interviewResult');
      const storedScore = localStorage.getItem('interviewScore');
      const storedEndReason = localStorage.getItem('interviewEndReason');
      setResult(storedResult);
      setScore(storedScore ? Number(storedScore) : null);
      setEndReason(storedEndReason);
      localStorage.setItem('summaryVisited', 'true');
      // Clear the completion flag so future visits go through the DB path
      sessionStorage.removeItem('interviewJustCompleted');
      localStorage.removeItem('interviewJustCompleted');

      (async () => {
        if (storedResult === 'PASS') {
          await syncPhaseToDb(4);
        }
        setPhaseSynced(true);

        try {
          const res = await fetch('/api/candidate/attempts', {
            headers: { Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token')}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.cooldownDays) setCooldownDays(data.cooldownDays);
          }
        } catch {
          // non-fatal
        } finally {
          setLoading(false);
        }
      })();
    } else {
      // ── Subsequent visit: always read fresh from DB so re-evaluations are reflected ──
      (async () => {
        try {
          const res = await fetch('/api/candidate/attempts', {
            headers: { Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token')}` },
          });
          if (res.ok) {
            const data = await res.json();
            const latest = data.attempts?.[0];
            if (latest) {
              setResult(latest.result);
              setScore(latest.overall_score);
              localStorage.setItem('interviewResult', latest.result || '');
              localStorage.setItem('interviewScore', String(latest.overall_score ?? ''));
            }
            if (data.cooldownDays) setCooldownDays(data.cooldownDays);
          }
        } catch {
          // non-fatal — fall back to localStorage
        } finally {
          // On revisit (including re-evaluation), sync phase if PASS — backend already updated
          // currentPhase to 'documents', so re-syncing is safe and idempotent.
          // Skip for FAIL so their phase stays as the backend set it (interview / summary).
          if (localStorage.getItem('interviewResult') === 'PASS') {
            await syncPhaseToDb(4);
          }
          setPhaseSynced(true);
          setLoading(false);
        }
      })();
    }
  }, []);

  const formatEndReason = (reason: string | null): string => {
    switch (reason) {
      case 'anti_cheat': return 'Interview closed due to anti-cheat policy violation';
      case 'withdrawn': return 'Interview ended by candidate (voluntary withdrawal)';
      case 'question_limit': return 'Interview ended after reaching the question limit';
      case 'time_limit': return 'Interview ended after the time limit was reached';
      default: return 'Interview ended';
    }
  };

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <p>Loading results...</p>
          </div>
        </div>
      </main>
    );
  }

  const isPass = result === 'PASS';

  return (
    <main className={styles.container}>
      <div className={styles.content}>
          {/* Pass/Fail Badge */}
        <div className={styles.resultSection}>
          <div
            className={styles.resultBadge}
            style={{
              backgroundColor: isPass ? '#22c55e' : '#ef4444',
              color: 'white',
            }}
          >
            {isPass ? '✓ PASSED' : '✗ FAILED'}
          </div>

          {score !== null && (
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
        {!isPass && (
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