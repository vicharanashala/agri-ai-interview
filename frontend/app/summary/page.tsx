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
  const router = useRouter();

  useEffect(() => {
    // Result is set by the interview page before redirecting here
    const storedResult = localStorage.getItem('interviewResult');
    const storedScore = localStorage.getItem('interviewScore');
    const storedEndReason = localStorage.getItem('interviewEndReason');
    setResult(storedResult);
    setScore(storedScore ? Number(storedScore) : null);
    setEndReason(storedEndReason);

    // Mark summary as visited and unlock Phase 4 (Upload Documents) for PASS candidates
    localStorage.setItem('summaryVisited', 'true');
    if (storedResult === 'PASS') {
      syncPhaseToDb(4);
    }

    // Fetch cooldown days from the admin-configured setting
    const fetchCooldown = async () => {
      try {
        const res = await fetch('/api/candidate/attempts', {
          headers: { Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token')}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.cooldownDays) {
            setCooldownDays(data.cooldownDays);
          }
        }
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    };

    fetchCooldown();
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
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}