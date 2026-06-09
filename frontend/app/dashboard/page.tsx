'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './page.module.css';
import HowToUseModal from '@/components/HowToUseModal';

type Phase = 1 | 2 | 3 | 4;

interface PhaseInfo {
  id: Phase;
  name: string;
  description: string;
  status: 'completed' | 'current' | 'locked';
}

interface EvaluationResult {
  overall_score: number;
  metrics: Record<string, { score: number; details: string }>;
  summary: string;
  recommendation: string;
  status?: string;
}

interface Attempt {
  id: string;
  status: string;
  overall_score: number | null;
  result: string | null;
  completedAt: string | null;
}

export default function DashboardPage() {
  const [currentPhase, setCurrentPhase] = useState<Phase>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [interviewResult, setInterviewResult] = useState<EvaluationResult | null>(null);
  const [hasCompletedInterview, setHasCompletedInterview] = useState(false);
  const [showAlreadyDoneDialog, setShowAlreadyDoneDialog] = useState(false);
  const [showNoAttemptsLeftDialog, setShowNoAttemptsLeftDialog] = useState(false);
  const [showCooldownDialog, setShowCooldownDialog] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const router = useRouter();

  const handleFaqClick = () => {
    router.push('/faq');
  };

  useEffect(() => {
    // Map DB phase label → number (source of truth for pipeline progress)
    const DB_PHASE_NUM: Record<string, number> = {
      'onboarding': 1,
      'interview':  2,
      'summary':    3,
      'documents':  4,
    };

    const checkProfile = async () => {
      try {
        const response = await fetch('/api/candidate');
        if (!response.ok) throw new Error('Failed to fetch candidate');
        const candidate = await response.json();

        if (!candidate) {
          setIsLoading(false);
          return;
        }

        // 1. DB phase as starting point (source of truth — survives logout/login)
        const dbPhaseNum = (DB_PHASE_NUM[candidate.currentPhase] ?? 1) as Phase;

        // 2. Pull latest flag values from DB (authoritative) and localStorage (for in-flight updates)
        const dbSummaryVisited  = !!candidate.passedAndVisitedSummary;
        const lsSummaryVisited  = localStorage.getItem('passedAndVisitedSummary') === 'true';

        const summaryVisited = dbSummaryVisited || lsSummaryVisited;

        // 3. Reconstruct actual phase from DB phase + flags
        let actualPhase: Phase = dbPhaseNum;

        if (summaryVisited && actualPhase < 3) actualPhase = 3;

        setCurrentPhase(actualPhase);
        setHasCompletedInterview(actualPhase >= 3);

        // Sync storage flags from DB
        if (dbSummaryVisited) localStorage.setItem('passedAndVisitedSummary', 'true');

        // Persist candidate info in sessionStorage for downstream pages (offer letter, etc.)
        if (candidate.fullName) sessionStorage.setItem('candidateName',  candidate.fullName);
        if (candidate.phone)    sessionStorage.setItem('candidatePhone', candidate.phone);
        if (candidate.email)    sessionStorage.setItem('candidateEmail', candidate.email);

        // Also mirror to localStorage so values survive page refresh
        if (candidate.fullName) localStorage.setItem('candidateName',  candidate.fullName);
        if (candidate.phone)    localStorage.setItem('candidatePhone', candidate.phone);
        if (candidate.email)    localStorage.setItem('candidateEmail', candidate.email);

        // If interview was just completed (redirect flag set by interview page), go to summary
        // Only redirect if: phase >= 3 AND summary hasn't already been visited this session
        const justCompleted = sessionStorage.getItem('interviewJustCompleted') === 'true'
          || localStorage.getItem('interviewJustCompleted') === 'true';
        if (actualPhase >= 3 && justCompleted && !summaryVisited) {
          // Clear flag immediately so re-renders don't re-trigger the redirect
          sessionStorage.removeItem('interviewJustCompleted');
          localStorage.removeItem('interviewJustCompleted');
          setTimeout(() => router.push('/summary'), 500);
        } else {
          // Summary already visited or flag absent — ensure flag is clean
          sessionStorage.removeItem('interviewJustCompleted');
          localStorage.removeItem('interviewJustCompleted');
        }
      } catch (error) {
        console.error('Error fetching candidate profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const loadAttempts = async () => {
      try {
        const res = await fetch('/api/candidate/attempts');
        if (res.ok) {
          const data = await res.json();
          setAttempts(data.attempts ?? []);
          if (data.cooldownUntil) {
            setCooldownUntil(data.cooldownUntil);
          }
        }
      } catch (err) {
        console.error('Error loading attempts:', err);
      }
    };

    checkProfile();
    loadAttempts();
  }, [router]);

  // ── Cooldown countdown timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownTimeLeft(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(cooldownUntil).getTime() - Date.now();
      if (remaining <= 0) {
        setCooldownTimeLeft(null);
        setCooldownUntil(null);
        return;
      }
      const totalSec = Math.floor(remaining / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      if (d > 0) setCooldownTimeLeft(`${d}d ${h}h ${m}m`);
      else if (h > 0) setCooldownTimeLeft(`${h}h ${m}m ${s}s`);
      else setCooldownTimeLeft(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // Compute phases dynamically based on state
  const phases: PhaseInfo[] = [
    {
      id: 1,
      name: 'Onboarding',
      description: 'Complete your profile and verification',
      status: currentPhase > 1 ? 'completed' : currentPhase === 1 ? 'current' : 'locked',
    },
    {
      id: 2,
      name: 'Start Interview',
      description: 'Take your AI-powered interview session',
      status: currentPhase > 2 ? 'completed' : currentPhase >= 2 ? 'current' : 'locked',
    },
    {
      id: 3,
      name: 'Interview Summary',
      description: 'View your interview results and scores',
      status: currentPhase > 3 ? 'completed' : currentPhase >= 3 ? 'current' : 'locked',
    },
    {
      id: 4,
      name: 'Upload Documents',
      description: 'Submit required documents to complete the process',
      status: currentPhase > 4 ? 'completed' : currentPhase >= 4 ? 'current' : 'locked',
    },
  ];

  const handlePhaseClick = async (phase: PhaseInfo) => {
    // Allow clicking on current or completed phases
    if (phase.status === 'current' || phase.status === 'completed') {
      // If Phase 2 (Start Interview) is completed, show popup
      if (phase.id === 2 && phase.status === 'completed') {
        setShowAlreadyDoneDialog(true);
        return;
      }
      
      // Navigate to appropriate page based on phase
      switch (phase.id) {
        case 1:
          router.push('/onboarding');
          break;
        case 2:
          if (phase.status === 'current') {
            // Check cooldown first
            if (cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()) {
              setShowCooldownDialog(true);
              return;
            }
            // Check attempts count
            const usedAttempts = attempts.filter(
              (a: { result?: string | null }) => ['PASS', 'FAIL', 'WITHDRAWN'].includes(a.result ?? '')
            ).length;
            if (usedAttempts >= 3) {
              setShowNoAttemptsLeftDialog(true);
              return;
            }
            // Always go through /post-login to ensure candidate_session_token
            // is created and stored in sessionStorage before entering /interview.
            router.push('/post-login?callbackUrl=/interview');
          } else {
            router.push('/interview/queue');
          }
          break;
        case 3:
          router.push('/summary');
          break;
        case 4:
          router.push('/upload-documents');
          break;
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'current':
        return '▶';
      default:
        return '○';
    }
  };

  const handleAdvancePhase = (completedPhase: Phase) => {
    // Only advance if the current phase is completed
    // This is called by child pages when they finish their tasks
    if (completedPhase === currentPhase && currentPhase < 4) {
      const nextPhase = (currentPhase + 1) as Phase;
      setCurrentPhase(nextPhase);
      sessionStorage.setItem('interviewPhase', String(nextPhase));
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    // Destroy Redis session (best-effort — don't block if it fails)
    const redisToken = sessionStorage.getItem('candidate_session_token')
    if (redisToken) {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      fetch(`${backendUrl}/api/candidate/session/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
      }).catch(() => {})
    }

    sessionStorage.clear()
    localStorage.clear()
    await signOut({ redirect: false })
    router.push('/login')
  };

  const isPassed = interviewResult && interviewResult.overall_score >= 60;
  const isCompleted = hasCompletedInterview || currentPhase >= 3;

  if (isLoading) {
    return (
      <main className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Interview Progress Dashboard</h1>
        <p className={styles.subtitle}>Track your journey through the hiring process</p>
        <div className={styles.headerButtons}>
          <button
            onClick={handleFaqClick}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#08CB00',
              background: 'rgba(8, 203, 0, 0.08)',
              border: '1px solid rgba(8, 203, 0, 0.3)',
              borderRadius: '8px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            💬 FAQ & Help
          </button>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#6b7280',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              opacity: loggingOut ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>

      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill} 
            style={{ width: `${(currentPhase - 1) * 25}%` }}
          />
        </div>
        <span className={styles.progressPercent}>
          {(currentPhase - 1) * 25}% Complete
        </span>
      </div>

      {/* How to Use / Tutorial Video */}
      <div style={{ maxWidth: 700, margin: '0 auto 12px' }}>
        <div
          onClick={() => setShowVideoModal(true)}
          style={{
            background: 'linear-gradient(135deg, rgba(8,203,0,0.12) 0%, rgba(139,92,246,0.12) 100%)',
            border: '1px solid rgba(8,203,0,0.25)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(8,203,0,0.5)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(8,203,0,0.25)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          }}
        >
          <div style={{
            width: 52, height: 52,
            borderRadius: '50%',
            background: 'rgba(8,203,0,0.2)',
            border: '2px solid rgba(8,203,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: '#08CB00', flexShrink: 0,
          }}>
            ▶
          </div>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '15px', fontWeight: 700, margin: 0, padding: 0 }}>
              🎥 Watch: How to Use This App & Take the Interview
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '4px 0 0 0', padding: 0 }}>
              Click to watch the tutorial video before proceeding
            </p>
          </div>
          <span style={{ marginLeft: 'auto', color: 'rgba(8,203,0,0.7)', fontSize: 20 }}>→</span>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 20px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: 'rgba(255,200,0,0.9)', fontSize: '13px', fontWeight: 700, margin: '0 0 8px 0', padding: 0 }}>Important Instructions</p>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', lineHeight: 1.8, margin: 0, padding: 0 }}>
          1. The candidate will be allowed maximum 3 attempts.<br/>
          2. On failing the interview there will be a cooldown period after which candidate is allowed next attempt.<br/>
          3. Please read the interview instructions carefully, failing which may lead to interview closure.
        </p>
      </div>

      {/* Cooldown countdown banner */}
      {cooldownTimeLeft && (
        <div className={styles.attemptsCard}>
          <h2 className={styles.attemptsTitle}>⏳ Interview Cooldown Active</h2>
          <p style={{ color: '#374151', fontSize: '15px', margin: 0 }}>
            You can retry the interview after <strong style={{ fontWeight: 700 }}>{cooldownTimeLeft}</strong>.
          </p>
        </div>
      )}

      {/* Past Interview Attempts */}
      {attempts.length > 0 && (
        <div className={styles.attemptsCard}>
          <h2 className={styles.attemptsTitle}>
            Interview Attempts ({attempts.length}/3)
          </h2>
          <div className={styles.attemptsList}>
            {attempts.map((attempt, index) => {
              const date = attempt.completedAt
                ? new Date(attempt.completedAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';

              const badgeClass =
                attempt.result === 'PASS'
                  ? styles.badgePass
                  : attempt.result === 'FAIL'
                  ? styles.badgeFail
                  : attempt.result === 'WITHDRAWN'
                  ? styles.badgeWithdrawn
                  : attempt.result === 'ANTI_CHEAT'
                  ? styles.badgeAntiCheat
                  : styles.badgeCompleted;

              return (
                <div key={attempt.id} className={styles.attemptRow}>
                  <span className={styles.attemptNumber}>#{index + 1}</span>
                  <span className={badgeClass}>
                    {attempt.result ?? 'COMPLETED'}
                  </span>
                  {attempt.overall_score != null && (
                    <span className={styles.attemptScore}>
                      Score: {attempt.overall_score}/100
                    </span>
                  )}
                  <span className={styles.attemptDate}>{date}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.phasesList}>
        {phases.map((phase, index) => (
          <div
            key={phase.id}
            className={`${styles.phaseCard} ${styles[phase.status]}`}
            onClick={() => handlePhaseClick(phase)}
          >
            <div className={styles.phaseNumber}>{phase.id}</div>
            <div className={styles.phaseIcon}>{getStatusIcon(phase.status)}</div>
            <div className={styles.phaseContent}>
              <h3 className={styles.phaseName}>{phase.name}</h3>
              <p className={styles.phaseDescription}>{phase.description}</p>
            </div>
            <div className={styles.phaseStatus}>
              {phase.status === 'completed' && <span className={styles.completedBadge}>Completed</span>}
              {phase.status === 'current' && <span className={styles.currentBadge}>In Progress</span>}
              {phase.status === 'locked' && <span className={styles.lockedBadge}>🔒 Locked</span>}
            </div>
          </div>
        ))}
      </div>



      {/* Video Modal */}
      {showVideoModal && (
        <HowToUseModal onClose={() => setShowVideoModal(false)} videoUrl="https://youtu.be/Z3j6sWvPoGM" />
      )}

      {/* Interview Already Done Popup */}
      {showAlreadyDoneDialog && (
        <div className={styles.popupOverlay} onClick={() => setShowAlreadyDoneDialog(false)}>
          <div className={styles.popupDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popupIcon}>⚠️</div>
            <h2 className={styles.popupTitle}>Interview Already Done</h2>
            <p className={styles.popupMessage}>
              You have already completed your interview. Would you like to view your results or retake the interview?
            </p>
            <div className={styles.popupButtons}>
              <button 
                className={styles.popupSecondaryButton}
                onClick={() => setShowAlreadyDoneDialog(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.popupPrimaryButton}
                onClick={() => {
                  setShowAlreadyDoneDialog(false);
                  router.push('/summary');
                }}
              >
                View Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Attempts Left Dialog */}
      {showNoAttemptsLeftDialog && (
        <div className={styles.popupOverlay} onClick={() => setShowNoAttemptsLeftDialog(false)}>
          <div className={styles.popupDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popupIcon}>🚫</div>
            <h2 className={styles.popupTitle}>No Attempts Remaining</h2>
            <p className={styles.popupMessage}>
              You have used all 3 available interview attempts. No further interviews can be started.
            </p>
            <div className={styles.popupButtons}>
              <button
                className={styles.popupSecondaryButton}
                onClick={() => setShowNoAttemptsLeftDialog(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cooldown Active Dialog */}
      {showCooldownDialog && (
        <div className={styles.popupOverlay} onClick={() => setShowCooldownDialog(false)}>
          <div className={styles.popupDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popupIcon}>⏳</div>
            <h2 className={styles.popupTitle}>Cooldown Active</h2>
            <p className={styles.popupMessage}>
              {cooldownTimeLeft
                ? <>You can retry the interview in <strong>{cooldownTimeLeft}</strong>.</>
                : 'You are currently in cooldown and cannot start a new interview yet.'}
            </p>
            <div className={styles.popupButtons}>
              <button
                className={styles.popupSecondaryButton}
                onClick={() => setShowCooldownDialog(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
