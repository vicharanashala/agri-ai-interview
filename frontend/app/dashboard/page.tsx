'use client';

import FullPageSkeleton from '@/components/FullPageSkeleton';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './page.module.css';
import HowToUseModal from '@/components/HowToUseModal';
import BrandLogos from '@/components/BrandLogos';
import ProfileNavButton from '@/components/ProfileNavButton';

type Phase = 1 | 2 | 3 | 4 | 5;

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
  startedAt: string | null;
}

export default function DashboardPage() {
  const [currentPhase, setCurrentPhase] = useState<Phase>(1);
  const [documentsSubmitted, setDocumentsSubmitted] = useState(false);
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
  const [expandedTab, setExpandedTab] = useState<'instructions' | 'attempts' | 'tutorial' | null>(null);
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
      'foundation': 4,
      'documents':  5,
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
        const dbSummaryVisited      = !!candidate.passedAndVisitedSummary;
        const lsSummaryVisited      = localStorage.getItem('passedAndVisitedSummary') === 'true';
        const lsFoundationCompleted = localStorage.getItem('foundationCourseCompleted') === 'true' || localStorage.getItem('foundationCourseCompleted') === 'completed';

        const summaryVisited = dbSummaryVisited || lsSummaryVisited;

        // 3. Pull milestone flags from DB and localStorage
        const docsSubmitted       = !!candidate.documentsSubmitted;
        const foundationCompleted = lsFoundationCompleted || !!candidate.foundationCourseCompleted;
        setDocumentsSubmitted(docsSubmitted);

        // 4. Reconstruct actual phase from DB phase + flags
        let actualPhase: Phase = dbPhaseNum;

        if (summaryVisited       && actualPhase < 3) actualPhase = 3;
        if (foundationCompleted  && actualPhase < 4) actualPhase = 4;
        if (docsSubmitted        && actualPhase < 5) actualPhase = 5;

        setCurrentPhase(actualPhase);
        setHasCompletedInterview(actualPhase >= 3);

        // Sync storage flags from DB — clear stale localStorage if DB says flag is not set
        if (dbSummaryVisited) {
          localStorage.setItem('passedAndVisitedSummary', 'true');
        } else {
          localStorage.removeItem('passedAndVisitedSummary');
        }

        if (candidate.foundationCourseCompleted) {
          localStorage.setItem('foundationCourseCompleted', 'completed');
        } else if (!lsFoundationCompleted) {
          localStorage.removeItem('foundationCourseCompleted');
        }

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
        const res = await fetch('/api/candidate/attempts', { credentials: 'include', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          console.log('[loadAttempts] API response:', JSON.stringify(data));
          setAttempts(data.attempts ?? []);
          // Always sync cooldown from fresh API response — deadline is computed
          // dynamically so stale localStorage values must not override it.
          if (data.cooldownUntil) {
            setCooldownUntil(data.cooldownUntil);
            localStorage.setItem('cooldownUntil', data.cooldownUntil);
          } else {
            setCooldownUntil(null);
            localStorage.removeItem('cooldownUntil');
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

  const hasPassed = attempts.some(a => a.result === 'PASS');
  const hasAttemptsLeft = attempts.length < 3;

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
      status: hasPassed
        ? 'completed'
        : (attempts.length > 0 && !hasAttemptsLeft)
        ? 'completed' // Failed all attempts
        : (attempts.length > 0 && hasAttemptsLeft)
        ? 'current'   // Re-attempt is active
        : currentPhase >= 2
        ? 'current'
        : 'locked',
    },
    {
      id: 3,
      name: 'Interview Summary',
      description: 'View your interview results and scores',
      status: currentPhase > 3
        ? 'completed'
        : (attempts.length > 0 && !hasPassed && hasAttemptsLeft)
        ? 'completed' // Unlocked but not active (re-attempt is active)
        : currentPhase === 3
        ? 'current'   // Active summary
        : 'locked',
    },
    {
      id: 4,
      name: 'Foundation Course',
      description: 'Complete the foundation course to unlock document upload',
      status: currentPhase > 4 ? 'completed' : currentPhase === 4 ? 'current' : 'locked',
    },
    {
      id: 5,
      name: 'Upload Documents',
      description: 'Submit required documents to complete the process',
      status: documentsSubmitted ? 'completed' : currentPhase === 5 ? 'current' : 'locked',
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
          router.push('/foundation-course');
          break;
        case 5:
          router.push('/upload-documents');
          break;
      }
    }
  };

  const getStatusIcon = (phase: PhaseInfo) => {
    if (phase.id === 2) {
      if (hasPassed) return '✓';
      if (attempts.length >= 3 && !hasPassed) return '✗';
      if (attempts.length > 0 && attempts.length < 3 && !hasPassed) return '▶';
    }
    switch (phase.status) {
      case 'completed':
        return '✓';
      case 'current':
        return '▶';
      default:
        return '○';
    }
  };
 const getCompletionPercentage = () => {
  if (documentsSubmitted) return 100;
  if (currentPhase === 5) return 75;
  if (currentPhase === 4) return 50;
  if (currentPhase === 3) return hasPassed ? 50 : 25;
  if (currentPhase === 2) return 25;
  return 0;
  };
  const globalProgress = getCompletionPercentage();

  const handleAdvancePhase = (completedPhase: Phase) => {
    // Only advance if the current phase is completed
    // This is called by child pages when they finish their tasks
    if (completedPhase === currentPhase && currentPhase < 5) {
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
      const backendUrl = process.env.NEXT_PUBLIC_API_URL
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
      <FullPageSkeleton />
    );
  }


  const renderPhaseCard = (phase: PhaseInfo) => {
    const isCompleted = phase.status === 'completed';
    const isCurrent = phase.status === 'current';

    let buttonText = null;
    let showButton = false;
    
    if (phase.id === 2 && (isCurrent || phase.status === 'completed')) {
      if (hasPassed) {
        showButton = false; // completed, no button
      } else if (attempts.length >= 3 && !hasPassed) {
        buttonText = 'Failed'; // maybe no button? or disabled
        showButton = true;
      } else if (attempts.length > 0 && attempts.length < 3 && !hasPassed) {
        buttonText = '▶ Re-attempt';
        showButton = true;
      } else if (isCurrent) {
        buttonText = '▶ Start Interview';
        showButton = true;
      }
    } else if (phase.id === 3 && (isCompleted || isCurrent)) {
      showButton = true;
      buttonText = '▶ View Summary';
    }

    return (
      <div className={`${styles.phaseCard} ${styles[phase.status]}`} onClick={() => handlePhaseClick(phase)}>
        {isCurrent && <div className={styles.activeMissionBadge}>ACTIVE MISSION</div>}
        <div className={styles.cardHeader}>
          <div className={styles.phaseNumberBadge}>
            {isCompleted ? '✓' : phase.id}
          </div>
          <div className={styles.statusBadge}>
            {isCompleted ? '✓ Completed' : isCurrent ? 'IN PROGRESS' : '🔒 LOCKED'}
          </div>
        </div>
        <div className={styles.cardBody}>
          <h3 className={styles.phaseTitle}>{phase.name}</h3>
          <p className={styles.phaseDesc}>{phase.description}</p>
        </div>
        
        {showButton && buttonText && (
          <button 
            className={`${styles.startInterviewBtn} ${buttonText === 'Failed' ? styles.btnDisabled : ''}`} 
            onClick={(e) => { 
              e.stopPropagation(); 
              if (buttonText !== 'Failed') handlePhaseClick(phase); 
            }}
            disabled={buttonText === 'Failed'}
          >
            {buttonText}
          </button>
        )}

        <div className={styles.cardFooterTransparent}>
          <div className={styles.progressSection}>
            <div className={styles.miniProgressBar}>
              <div className={styles.miniProgressFill} style={{ width: `${globalProgress}%` }}></div>
            </div>
            <span className={styles.progressPercent}>{globalProgress}%</span>
          </div>
          <span className={styles.stageText}>Stage 0{phase.id}</span>
        </div>
      </div>
    );
  };

  return (
    <main className={styles.container}>
      {/* Top Navbar */}
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <BrandLogos variant="header" />
          <div className={styles.headerButtons}>
            <ProfileNavButton />
          </div>
        </div>
      </nav>
      {/* Main Dashboard Content */}
      <div className={styles.contentContainer}>
        <div className={styles.pageHeader}>
          <h1 className={styles.dashboardTitle}>Interview Progress Dashboard</h1>
          
        </div>

        {/* Greeting Banner */}
        <div className={styles.greetingBanner}>
          <span className={styles.greetingText}>
            {documentsSubmitted ? (
              <>🎉 <strong>Congratulations!</strong> You have successfully completed all the steps. The HR team will coordinate with you for the further steps.</>
            ) : currentPhase === 1 ? (
              <>Step 1 unlocked — let's get you <strong style={{color: '#10b981', marginLeft: '0'}}>onboarded</strong>!</>
            ) : currentPhase === 2 ? (
              <>Step 2 unlocked — it's time for your <strong style={{color: '#f59e0b', marginLeft: '0'}}>interview</strong>!</>
            ) : currentPhase === 3 ? (
              <>Step 3 unlocked — your <strong style={{color: '#f59e0b', marginLeft: '0'}}>interview results</strong> are ready!</>
            ) : currentPhase === 4 ? (
              <>Step 4 unlocked — it's time to begin your <strong style={{color: '#f59e0b', marginLeft: '0'}}>Foundation Course</strong>!</>
            ) : currentPhase === 5 ? (
              <>Step 5 unlocked — you're almost there, upload your <strong style={{color: '#f59e0b', marginLeft: '0'}}>documents</strong>!</>
            ) : null}
          </span>
        </div>

        {/* Action Tabs / Collapsibles */}
        <div className={styles.actionTabsContainer}>
          <div className={styles.tabButtons}>
            <button className={`${styles.tabBtn} ${expandedTab === 'instructions' ? styles.activeTab : ''}`} onClick={() => setExpandedTab(expandedTab === 'instructions' ? null : 'instructions')}>
              <div className={styles.tabIconOrange}>!</div> Important Instructions <div className={styles.dotOrange}></div>
            </button>
            <button className={`${styles.tabBtn} ${expandedTab === 'attempts' ? styles.activeTab : ''}`} onClick={() => setExpandedTab(expandedTab === 'attempts' ? null : 'attempts')}>
              <div className={styles.tabIconGreen}></div> Attempts: {attempts.length} / 3 <span className={styles.badgeLightGreen}>{3 - attempts.length} Left</span>
            </button>
            <button className={`${styles.tabBtn} ${expandedTab === 'tutorial' ? styles.activeTab : ''}`} onClick={() => setExpandedTab(expandedTab === 'tutorial' ? null : 'tutorial')}>
              <div className={styles.tabIconPlay}>▶</div> Watch Tutorial
            </button>
          </div>
          
          <div className={`${styles.tabContentArea} ${expandedTab ? styles.contentExpanded : ''}`}>
            {expandedTab === 'instructions' && (
              <ul className={styles.instructionsList}>
                <li><span className={styles.listNum}>1</span> The candidate will be allowed maximum 3 attempts.</li>
                <li><span className={styles.listNum}>2</span> On failing the interview there will be a cooldown period after which candidate is allowed next attempt.</li>
                <li><span className={styles.listNum}>3</span> Please read the interview instructions carefully, failing which may lead to interview closure.</li>
              </ul>
            )}
            {expandedTab === 'attempts' && (
              <div className={styles.attemptsContent}>
                {cooldownTimeLeft ? (
                  <p>Interview Cooldown Active. You can retry after <strong>{cooldownTimeLeft}</strong>.</p>
                ) : attempts.length === 0 ? (
                  <p className={styles.noAttemptsText}>No attempts yet.</p>
                ) : (
                  <div className={styles.attemptsList}>
                    {attempts.map((attempt, index) => (
                      <div key={attempt.id} className={styles.attemptRow}>
                        <span className={styles.attemptNumber}>#{index + 1}</span>
                        <span className={styles.attemptScore}>{attempt.result ?? 'COMPLETED'}</span>
                        <span className={styles.attemptDate}>
                          {attempt.completedAt ? new Date(attempt.completedAt).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {expandedTab === 'tutorial' && (
              <div className={styles.tutorialContent}>
                <p>Learn how to use this app and take the interview.</p>
                <button className={styles.watchVideoBtn} onClick={() => setShowVideoModal(true)}>
                  ▶ Watch Tutorial Video
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Phases S-Curve Grid */}
        <div className={styles.sCurveGrid}>
          {/* Row 1 */}
          <div className={styles.gridItem}>
            {renderPhaseCard(phases[0])}
          </div>
          <div className={styles.hConnector}>
            <svg width="100%" height="4"><line x1="0" y1="2" x2="100%" y2="2" stroke={currentPhase > 1 ? "#10b981" : "#e2e8f0"} strokeWidth="4" className={styles.animatedLine} strokeLinecap="round" /></svg>
          </div>
          <div className={styles.gridItem}>
            {renderPhaseCard(phases[1])}
          </div>
          <div className={styles.hConnector}>
            <svg width="100%" height="4"><line x1="0" y1="2" x2="100%" y2="2" stroke={currentPhase > 2 ? "#10b981" : "#e2e8f0"} strokeWidth="4" className={styles.animatedLine} strokeLinecap="round" /></svg>
          </div>
          <div className={styles.gridItem} style={{ position: 'relative' }}>
            {renderPhaseCard(phases[2])}
            {/* Absolute curve down to row 2 */}
            <div className={styles.curveConnectorRight}>
               <svg width="100%" height="100%" preserveAspectRatio="none">
                 <path d="M 0 0 C 40 0, 40 100, 0 100" stroke={currentPhase > 3 ? "#10b981" : "#e2e8f0"} strokeWidth="4" fill="none" className={styles.animatedLine} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
               </svg>
            </div>
          </div>

          {/* Row 2 */}
          <div className={styles.gridItemEmpty}></div>
          <div className={styles.gridItemEmpty}></div>
          <div className={styles.gridItem}>
            {renderPhaseCard(phases[4])}
          </div>
          <div className={styles.hConnector}>
             {/* Line flows right to left! */}
             <svg width="100%" height="4"><line x1="100%" y1="2" x2="0" y2="2" stroke={currentPhase > 4 ? "#10b981" : "#e2e8f0"} strokeWidth="4" className={styles.animatedLine} strokeLinecap="round" /></svg>
          </div>
          <div className={styles.gridItem}>
            {renderPhaseCard(phases[3])}
          </div>
        </div>

      {/* Video Modal */}
      {showVideoModal && (
        <HowToUseModal onClose={() => setShowVideoModal(false)} videoUrl="https://youtu.be/D22IYyDw5ME" />
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
      </div>
    </main>
  );
}
