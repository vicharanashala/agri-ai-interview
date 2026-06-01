'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type QueueResult =
  | 'queued'
  | 'ready'
  | 'interviewing'
  | 'paused'
  | 'cancelled'
  | 'skipped'
  | 'cooldown'
  | 'queue_full'
  | 'not_found'
  | 'already_queued';

interface QueueStatus {
  result: QueueResult;
  entry_id?: string;
  position?: number;
  status?: string;
  scheduled_at?: string;
  joined_at?: string;
  remaining_seconds?: number;
  reason?: string;
  skip_count?: number;
}

interface WaitTime {
  wait_seconds: number;
  is_approximate: boolean;
  label: string;
  avg_sample_count?: number;
  position?: number;
  candidates_ahead?: number;
  avg_interview_seconds?: number;
  slot_frees_at?: string;
  active_interview_count?: number;
  fallback?: boolean;
  note?: string;
}

type PanelState = 'loading' | 'error' | 'not_found' | QueueResult;

// ─── Constants ───────────────────────────────────────────────────────────────
const JOIN_WINDOW_SECONDS = 5 * 60; // 5 minutes — must match JOIN_WINDOW_MINUTES on backend

// ─── Component ───────────────────────────────────────────────────────────────

export default function QueuePage() {
  const router = useRouter();

  // Core state
  const [panel, setPanel] = useState<PanelState>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Queue status
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [waitTime, setWaitTime] = useState<WaitTime | null>(null);

  // Countdown for READY join window
  const [joinCountdown, setJoinCountdown] = useState<number | null>(null);
  const [windowExpired, setWindowExpired] = useState(false);

  // Cooldown countdown (live ticking)
  const [cooldownCountdown, setCooldownCountdown] = useState<number | null>(null);

  // Loading / action flags
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Candidate ID key: bump this whenever candidateId changes to force-reload
  const [candidateKey, setCandidateKey] = useState(0);
  // Initialize as empty string (safe for SSR), read from sessionStorage only after mount
  const [candidateId, setCandidateId] = useState('');
  useEffect(() => {
    setCandidateId(sessionStorage.getItem('candidateId') || '');
  }, [candidateKey]);
  // Detect when onboarding sets candidateId in a different tab
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'candidateId') setCandidateKey(k => k + 1);
    };
    window.addEventListener('storage', onStorage);
    // Also poll briefly on mount for the same-tab case (onboarding in same tab)
    const poll = setInterval(() => {
      const id = sessionStorage.getItem('candidateId') || '';
      if (id && id !== candidateId) setCandidateKey(k => k + 1);
    }, 500);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, [candidateId]);

  // Polling interval refs
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 5.1.3 — fetchWaitTime helper ───────────────────────────────────────────

  const fetchWaitTime = useCallback(async () => {
    const id = sessionStorage.getItem('candidateId') || '';
    if (!id) return;
    try {
      const res = await fetch(`/api/interview/queue/wait-time/${id}`);
      if (!res.ok) return;
      const data: WaitTime = await res.json();
      setWaitTime(data);
    } catch {
      // non-fatal
    }
  }, []);

  // ─── 5.1.2 — fetchStatus helper ─────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    const id = sessionStorage.getItem('candidateId') || '';
    if (!id) {
      setPanel('not_found');
      return;
    }

    try {
      const res = await fetch(`/api/interview/queue/status/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: QueueStatus = await res.json();
      setQueueStatus(data);

      if (data.result === 'not_found') {
        setPanel('not_found');
      } else if (
        data.result === 'queued' ||
        data.result === 'ready' ||
        data.result === 'interviewing' ||
        data.result === 'paused' ||
        data.result === 'cancelled' ||
        data.result === 'skipped' ||
        data.result === 'queue_full' ||
        data.result === 'already_queued'
      ) {
        setPanel(data.result);
      } else {
        setPanel(data.result);
      }

      // Also refresh wait time whenever status changes
      fetchWaitTime();
      setErrorMsg(null);
    } catch (err) {
      console.error('fetchStatus error:', err);
      setErrorMsg('Failed to load queue status. Check your connection.');
      setPanel('error');
    }
  }, [fetchWaitTime]);

  // ─── 5.1.2 — auto-poller: refetch status every 30 s ─────────────────────────

  useEffect(() => {
    fetchStatus();

    statusTimerRef.current = setInterval(fetchStatus, 30_000);

    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [fetchStatus]);

  // ─── 5.1.5 — startCooldownTimer: live ticking countdown ────────────────────

  const startCooldownTimer = (seconds: number) => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(cooldownTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
  };

  // ─── 5.1.6 — handleResume: resume from saved snapshot ─────────────────────

  const handleResume = async () => {
    setIsResuming(true);
    try {
      const res = await fetch('/api/interview/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: sessionStorage.getItem('candidateId') || '' }),
      });
      const data = await res.json();

      if (!res.ok || (data.result !== 'resumed' && data.result !== 'session_not_paused')) {
        setErrorMsg(data.reason || 'Could not resume. Please try again.');
        setPanel('error');
        return;
      }

      // Redirect to interview page — backend restores the snapshot
      router.push('/interview');
    } catch {
      setErrorMsg('Network error. Please check your connection.');
      setPanel('error');
    } finally {
      setIsResuming(false);
    }
  };

  // ─── 5.1.5 — handleCancel: voluntary cancel with cooldown ───────────────────

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const res = await fetch('/api/interview/queue/cancel', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: sessionStorage.getItem('candidateId') || '' }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.reason || 'Could not cancel. Please try again.');
        setPanel('error');
        return;
      }

      // Enter cooldown state with live countdown
      setPanel('cooldown');
      setCooldownCountdown(data.cooldown_seconds);
      startCooldownTimer(data.cooldown_seconds);

      // Immediately refresh queue state so queueStatus is current
      await fetchStatus();
      fetchWaitTime();
    } catch {
      setErrorMsg('Network error. Please check your connection.');
      setPanel('error');
    } finally {
      setIsCancelling(false);
    }
  };

  // ─── 5.1.4 — handleJoin: confirm arrival, then go to interview ──────────────

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      const res = await fetch('/api/interview/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: sessionStorage.getItem('candidateId') || '' }),
      });
      const data = await res.json();

      if (!res.ok || data.result !== 'confirmed') {
        setErrorMsg(data.reason || 'Could not join. Please try again.');
        setPanel('error');
        return;
      }

      // Clear any existing join countdown
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

      // Redirect to interview page
      router.push('/interview');
    } catch {
      setErrorMsg('Network error. Please check your connection.');
      setPanel('error');
    } finally {
      setIsJoining(false);
    }
  };

  // ─── 5.1.7 helper: loading / error / not-found ────────────────────────────────

  const renderLoading = () => (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <p className={styles.loadingText}>Checking your queue status…</p>
    </div>
  );

  const renderError = (msg: string) => (
    <div className={styles.stateBox}>
      <p className={styles.errorText}>{msg}</p>
      <button className={`${styles.button} ${styles.outlineBtn}`} onClick={() => setPanel('loading')}>
        Retry
      </button>
    </div>
  );

  const renderNotFound = () => (
    <div className={styles.stateBox}>
      <div className={`${styles.stateIcon} ${styles.notFoundIcon}`}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h2 className={`${styles.stateHeading} ${styles.notFoundHead}`}>No Queue Entry Found</h2>
      <p className={styles.stateText}>
        You don&apos;t have an active queue entry. Go to the dashboard to request an interview slot.
      </p>
      <button
        className={`${styles.button} ${styles.primaryBtn}`}
        onClick={() => router.push('/dashboard')}
      >
        Go to Dashboard
      </button>
    </div>
  );

  // ─── 5.1.8 — QUEUED state ────────────────────────────────────────────────────

  const formatWait = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  const renderWaitBadge = () => {
    if (!waitTime) return null;
    return (
      <span className={`${styles.waitBadge} ${waitTime.is_approximate ? styles.badgeApprox : styles.badgeExact}`}>
        {waitTime.is_approximate ? 'estimated' : 'based on active interviews'}
      </span>
    );
  };

  const renderQueued = () => (
    <div className={styles.stateBox}>
      <div className={`${styles.stateIcon} ${styles.queuedIcon}`}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </div>
      <h2 className={`${styles.stateHeading} ${styles.queuedHead}`}>You're in the Queue</h2>
      <p className={styles.stateText}>
        Hang tight — your interview slot will open soon. We'll notify you when it's your turn.
      </p>

      {queueStatus?.position !== undefined && (
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Your position</span>
          <span className={styles.infoValue}>#{queueStatus.position}</span>
        </div>
      )}

      {waitTime && (
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Estimated wait</span>
          <span className={styles.infoValue}>{formatWait(waitTime.wait_seconds)}</span>
          {renderWaitBadge()}
        </div>
      )}

      <div className={styles.footerActions}>
        {/* Position 1 with open slot — show countdown + Join button */}
        {queueStatus?.position === 1 && queueStatus?.scheduled_at ? (
          <>
            {joinCountdown !== null && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Time remaining to join</span>
                <span className={styles.infoValue} style={{ color: joinCountdown < 60 ? '#ef4444' : '#111' }}>
                  {formatWait(joinCountdown)}
                </span>
              </div>
            )}
            <button
              className={`${styles.button} ${styles.primaryBtn}`}
              onClick={handleJoin}
              disabled={isJoining}
            >
              {isJoining ? 'Joining…' : 'Join Interview'}
            </button>
            <span className={styles.backLink} onClick={() => router.push('/dashboard')}>
              ← Back to Dashboard
            </span>
          </>
        ) : queueStatus?.position === 1 ? (
          /* Position 1 but not yet READY — show pulsing "almost there" state */
          <>
            <div className={styles.almostThereMsg}>
              <div className={styles.pulseDot} />
              <span>Your interview is starting soon — please keep this tab open</span>
            </div>
            <button
              className={`${styles.button} ${styles.dangerBtn}`}
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </button>
            <span className={styles.backLink} onClick={() => router.push('/dashboard')}>
              ← Back to Dashboard
            </span>
          </>
        ) : (
          <>
            <button
              className={`${styles.button} ${styles.dangerBtn}`}
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </button>
            <span className={styles.backLink} onClick={() => router.push('/dashboard')}>
              ← Back to Dashboard
            </span>
          </>
        )}
      </div>
    </div>
  );

  // ─── 5.1.9 — READY state ────────────────────────────────────────────────────

  // Start join countdown when READY panel first renders
  useEffect(() => {
    const isJoinPanel = panel === 'ready' || (panel === 'queued' && queueStatus?.position === 1 && queueStatus?.scheduled_at);
    if (!isJoinPanel) {
      setWindowExpired(false);
      return;
    }
    setJoinCountdown(JOIN_WINDOW_SECONDS); // default; will be overwritten by tick
    setWindowExpired(false);

    const scheduledAt = queueStatus?.scheduled_at
      ? new Date(queueStatus.scheduled_at).getTime()
      : Date.now();
    const deadline = scheduledAt + JOIN_WINDOW_SECONDS * 1_000;

    // Guard flag prevents skip() from being called more than once.
    // Also protects against React StrictMode double-mount: the cleanup
    // clears the interval but StrictMode remounts before the interval
    // fires — without this flag, the remounted tick() could call skip().
    const hasSkipped = { current: false };

    // Always clear any pre-existing interval before starting a new one.
    // This is the key fix for StrictMode double-mount: the first mount's
    // interval is still running when StrictMode remounts. By clearing
    // via the ref (which persists across mount cycles), we stop the
    // stale interval before starting the new one.
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    const tick = async () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
      setJoinCountdown(remaining);

      if (remaining === 0 && !hasSkipped.current) {
        hasSkipped.current = true;
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setWindowExpired(true);

        // Tell backend the candidate missed their window → skip + cooldown
        try {
          await fetch(`/api/interview/queue/skip/${sessionStorage.getItem('candidateId') || ''}`, { method: 'POST' });
        } catch {
          // non-fatal — status refresh will pick up the new state
        }

        // Transition to cooldown after a brief message showing "expired"
        setTimeout(() => {
          fetchStatus(); // refresh state from backend
        }, 1_500);
      }
    };

    tick();
    countdownTimerRef.current = setInterval(tick, 1_000);
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [panel, queueStatus, fetchStatus]);

  const renderReady = () => {
    if (windowExpired) {
      return (
        <div className={styles.stateBox}>
          <div className={`${styles.stateIcon} ${styles.cancelledIcon}`}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 6v6l4 2" />
            </svg>
          </div>
          <h2 className={`${styles.stateHeading} ${styles.cancelledHead}`}>Window Expired</h2>
          <p className={styles.stateText}>
            You didn&apos;t join in time. You&apos;ve been placed on a short cooldown — please wait before trying again.
          </p>
          <div className={styles.loading} style={{ padding: '16px 0' }}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>Refreshing your status…</p>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.stateBox}>
        <div className={`${styles.stateIcon} ${styles.readyIcon}`}>
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className={`${styles.stateHeading} ${styles.readyHead}`}>Your Slot is Ready!</h2>
        <p className={styles.stateText}>
          Your interview slot has opened. Join now — the window closes in:
        </p>

        {joinCountdown !== null && (
          <div className={styles.infoRow} style={{ justifyContent: 'center' }}>
            <span className={styles.infoLabel}>Time remaining</span>
            <span
              className={styles.infoValue}
              style={{ color: joinCountdown < 60 ? '#dc2626' : '#059669', fontSize: '18px' }}
            >
              {formatWait(joinCountdown)}
            </span>
          </div>
        )}

        <div className={styles.footerActions}>
          <button
            className={`${styles.button} ${styles.primaryBtn}`}
            onClick={handleJoin}
            disabled={isJoining}
          >
            {isJoining ? 'Joining…' : '🎤  Join Interview'}
          </button>
          <span className={styles.backLink} onClick={handleCancel}>
            Cancel and leave queue
          </span>
        </div>
      </div>
    );
  };

  // ─── 5.1.10 — COOLDOWN state ─────────────────────────────────────────────────

  const renderCooldown = () => {
    const cooldownSec = cooldownCountdown ?? queueStatus?.remaining_seconds ?? 0;
    const expired = cooldownSec === 0;

    return (
      <div className={styles.stateBox}>
        <div className={`${styles.stateIcon} ${styles.cooldownIcon}`}>
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 6v6l4 2" />
          </svg>
        </div>
        <h2 className={`${styles.stateHeading} ${styles.cooldownHead}`}>Cooldown Active</h2>
        <p className={styles.stateText}>
          {queueStatus?.reason === 'skipped'
            ? "You missed your join window. Please wait before trying again."
            : "You cancelled your request. Please wait before trying again."}
        </p>

        {!expired && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Retry in</span>
            <span className={styles.infoValue} style={{ color: '#dc2626' }}>
              {formatWait(cooldownSec)}
            </span>
          </div>
        )}

        {expired && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Status</span>
            <span className={styles.infoValue} style={{ color: '#059669' }}>Ready to retry</span>
          </div>
        )}

        <div className={styles.footerActions}>
          <button
            className={`${styles.button} ${styles.primaryBtn}`}
            onClick={() => router.push('/dashboard')}
            disabled={!expired}
          >
            {expired ? 'Request New Slot' : `Retry in ${formatWait(cooldownSec)}`}
          </button>
        </div>
      </div>
    );
  };

  // ─── 5.1.11 — PAUSED state ──────────────────────────────────────────────────

  const renderPaused = () => (
    <div className={styles.stateBox}>
      <div className={`${styles.stateIcon} ${styles.pausedIcon}`}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      </div>
      <h2 className={`${styles.stateHeading} ${styles.pausedHead}`}>Interview Paused</h2>
      <p className={styles.stateText}>
        Your interview was interrupted but your progress has been saved. Resume from where you left off.
      </p>

      <div className={styles.footerActions}>
        <button
          className={`${styles.button} ${styles.primaryBtn}`}
          onClick={handleResume}
          disabled={isResuming}
        >
          {isResuming ? 'Resuming…' : 'Resume Interview'}
        </button>
        <button
          className={`${styles.button} ${styles.outlineBtn}`}
          onClick={handleCancel}
          disabled={isCancelling}
        >
          {isCancelling ? 'Cancelling…' : 'Cancel (discard progress)'}
        </button>
        <span className={styles.backLink} onClick={() => router.push('/dashboard')}>
          ← Back to Dashboard
        </span>
      </div>
    </div>
  );

  // ─── 5.1.12 — remaining states ──────────────────────────────────────────────

  const renderQueueFull = () => (
    <div className={styles.stateBox}>
      <div className={`${styles.stateIcon} ${styles.queueFullIcon}`}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.83L4.732 3.17A2.25 2.25 0 003.51 6.5h17.068c.96 0 1.556.966.956 1.886l-10.64 8.664A1.75 1.75 0 0110.944 18z" />
        </svg>
      </div>
      <h2 className={`${styles.stateHeading} ${styles.queueFullHead}`}>Queue is Full</h2>
      <p className={styles.stateText}>
        All interview slots are currently taken. Try again in a few minutes — slots open up regularly.
      </p>
      <div className={styles.footerActions}>
        <button
          className={`${styles.button} ${styles.primaryBtn}`}
          onClick={() => router.push('/dashboard')}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  const renderInterviewing = () => (
    <div className={styles.stateBox}>
      <div className={`${styles.stateIcon} ${styles.interviewingIcon}`}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className={`${styles.stateHeading} ${styles.interviewingHead}`}>Interview in Progress</h2>
      <p className={styles.stateText}>
        Your interview is running. This page is for waiting — you'll be redirected automatically.
      </p>
      <div className={styles.footerActions}>
        <button
          className={`${styles.button} ${styles.primaryBtn}`}
          onClick={() => router.push('/interview')}
        >
          Go to Interview
        </button>
      </div>
    </div>
  );

  const renderSkipped = () => (
    <div className={styles.stateBox}>
      <div className={`${styles.stateIcon} ${styles.cancelledIcon}`}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M18.364 5.636a9 9 0 010 12.728M6.343 5.636a9 9 0 000 12.728" />
        </svg>
      </div>
      <h2 className={`${styles.stateHeading} ${styles.cancelledHead}`}>Slot Missed</h2>
      <p className={styles.stateText}>
        You didn't join within the 5-minute window. You can re-request after the cooldown expires.
      </p>
      <div className={styles.footerActions}>
        <button
          className={`${styles.button} ${styles.outlineBtn}`}
          onClick={() => router.push('/dashboard')}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  const renderCancelled = () => (
    <div className={styles.stateBox}>
      <div className={`${styles.stateIcon} ${styles.cancelledIcon}`}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </div>
      <h2 className={`${styles.stateHeading} ${styles.cancelledHead}`}>Cancelled</h2>
      <p className={styles.stateText}>
        Your interview request was cancelled. You can request a new slot after the cooldown.
      </p>
      <div className={styles.footerActions}>
        <button
          className={`${styles.button} ${styles.outlineBtn}`}
          onClick={() => router.push('/dashboard')}
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  // ─── 5.1.13 — main render: wire all states ──────────────────────────────────

  const renderPanel = () => {
    switch (panel) {
      case 'loading': return renderLoading();
      case 'error':   return errorMsg ? renderError(errorMsg) : renderLoading();
      case 'not_found': return renderNotFound();
      case 'queued':      return renderQueued();
      case 'ready':       return renderReady();
      case 'cooldown':    return renderCooldown();
      case 'paused':      return renderPaused();
      case 'queue_full':  return renderQueueFull();
      case 'interviewing': return renderInterviewing();
      case 'skipped':    return renderSkipped();
      case 'cancelled':  return renderCancelled();
      case 'already_queued': return renderQueued();
      default: return renderLoading();
    }
  };

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <img src="/logo.svg" alt="Logo" className={styles.logo} />
        <p className={styles.brandSub}>Interview Queue</p>
      </div>

      {/* Card */}
      <div className={styles.card}>
        <h1 className={styles.cardTitle}>Interview Queue</h1>
        <p className={styles.cardSub}>Your interview slot status</p>

        <div className={styles.divider} />

        {renderPanel()}
      </div>
    </div>
  );
}