'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './page.module.css';

type Phase = 1 | 2 | 3 | 4 | 5 | 6;

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

export default function DashboardPage() {
  const [currentPhase, setCurrentPhase] = useState<Phase>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [interviewResult, setInterviewResult] = useState<EvaluationResult | null>(null);
  const [hasCompletedInterview, setHasCompletedInterview] = useState(false);
  const [joiningCompleted, setJoiningCompleted] = useState(false);
  const [showAlreadyDoneDialog, setShowAlreadyDoneDialog] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const handleFaqClick = () => {
    router.push('/faq');
  };

  useEffect(() => {
    // Check both sessionStorage and localStorage for phase state
    // Use the higher phase value from either storage
    const savedPhaseSession = sessionStorage.getItem('interviewPhase');
    const savedPhaseLocal = localStorage.getItem('interviewPhase');
    const sessionPhase = savedPhaseSession ? parseInt(savedPhaseSession) : 0;
    const localPhase = savedPhaseLocal ? parseInt(savedPhaseLocal) : 0;
    const savedPhase = Math.max(sessionPhase, localPhase).toString();

    // Fetch candidate profile from database
    const checkProfile = async () => {
      try {
        const response = await fetch('/api/candidate');
        if (response.ok) {
          const candidate = await response.json();
          
          // Determine the actual phase based on profile existence and saved phase
          let actualPhase: Phase = 1;
          
          if (candidate) {
            // Onboarding is complete, next step is interview
            actualPhase = 2;
            
            // Check if interview is completed (check both storage types)
            const interviewCompletedSession = sessionStorage.getItem('interviewCompleted');
            const interviewCompletedLocal = localStorage.getItem('interviewCompleted');
            const interviewCompleted = interviewCompletedSession || interviewCompletedLocal;
            
            if (interviewCompleted === 'true' || savedPhase === '3') {
              actualPhase = 3;
            }
          } else if (savedPhase) {
            // Fallback to saved phase
            actualPhase = parseInt(savedPhase) as Phase;
          }
          
          // If saved phase is already 4 or higher, use it directly
          if (savedPhase && parseInt(savedPhase) >= 4) {
            actualPhase = parseInt(savedPhase) as Phase;
          } else {
            // Check if student passed and visited summary - unlock offer letter phase (4)
            const passedAndVisitedSummary = localStorage.getItem('passedAndVisitedSummary');
            if (passedAndVisitedSummary === 'true' && actualPhase < 4) {
              actualPhase = 4;
            }
          }
          
          // Check if joining details page has been visited - mark as completed
          const joiningDetailsVisited = localStorage.getItem('joiningDetailsVisited');
          if (joiningDetailsVisited === 'true') {
            setJoiningCompleted(true);
          }
          
          setCurrentPhase(actualPhase);
          setHasCompletedInterview(actualPhase >= 3);
          
          // If interview was just completed, automatically navigate to summary
          // Check both storage types for the justCompleted flag
          const justCompletedSession = sessionStorage.getItem('interviewJustCompleted');
          const justCompletedLocal = localStorage.getItem('interviewJustCompleted');
          const justCompleted = justCompletedSession || justCompletedLocal;
          
          if (actualPhase >= 3 && justCompleted === 'true') {
            // Clear the flag from both storage types
            sessionStorage.removeItem('interviewJustCompleted');
            localStorage.removeItem('interviewJustCompleted');
            // Small delay to allow dashboard to render first
            setTimeout(() => {
              router.push('/summary');
            }, 500);
          }
        }
      } catch (error) {
        console.error('Error fetching candidate profile:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkProfile();
  }, [router]);

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
      name: 'View Offer Letter',
      description: 'Check your interview results and offer',
      status: currentPhase > 4 ? 'completed' : currentPhase >= 4 ? 'current' : 'locked',
    },
    {
      id: 5,
      name: 'Submit Signed Offer',
      description: 'Upload your signed offer letter',
      status: currentPhase > 5 ? 'completed' : currentPhase >= 5 ? 'current' : 'locked',
    },
    {
      id: 6,
      name: 'Joining Details',
      description: 'Complete your joining formalities',
      status: joiningCompleted || currentPhase > 6 ? 'completed' : currentPhase >= 6 ? 'current' : 'locked',
    },
  ];

  const handlePhaseClick = (phase: PhaseInfo) => {
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
          router.push('/interview');
          break;
        case 3:
          router.push('/summary');
          break;
        case 4:
          router.push('/offer');
          break;
        case 5:
          router.push('/signing');
          break;
        case 6:
          router.push('/joining');
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
    if (completedPhase === currentPhase && currentPhase < 6) {
      const nextPhase = (currentPhase + 1) as Phase;
      setCurrentPhase(nextPhase);
      sessionStorage.setItem('interviewPhase', String(nextPhase));
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut({ redirect: false });
    localStorage.clear();
    sessionStorage.clear();
    router.push('/login');
  };

  const handleReset = async () => {
    // Clear phase state immediately in UI
    setCurrentPhase(1);
    
    // Clear both sessionStorage and localStorage
    sessionStorage.setItem('interviewPhase', '1');
    localStorage.setItem('interviewPhase', '1');
    sessionStorage.removeItem('interviewCompleted');
    localStorage.removeItem('interviewCompleted');
    sessionStorage.removeItem('interviewJustCompleted');
    localStorage.removeItem('interviewJustCompleted');
    sessionStorage.removeItem('interviewEvaluation');
    sessionStorage.removeItem('currentInterview');
    sessionStorage.removeItem('interviewConversationHistory');
    localStorage.removeItem('passedAndVisitedSummary');
    sessionStorage.removeItem('offerSigned');
    localStorage.removeItem('offerSigned');
    localStorage.removeItem('joiningDetailsVisited');
    
    // Clear all candidate-related localStorage data
    localStorage.removeItem('candidateName');
    localStorage.removeItem('candidateEmail');
    localStorage.removeItem('candidatePhone');
    localStorage.removeItem('candidateFormData');
    localStorage.removeItem('candidateDataForSummary');
    localStorage.removeItem('candidateProfile');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('conversationHistory');
    localStorage.removeItem('evaluation');
    
    // Delete candidate data from database
    try {
      await fetch('/api/candidate', {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Error deleting candidate data:', error);
    }
    
    window.location.reload();
  };

  const handleViewSummary = () => {
    router.push('/summary');
  };

  const handleRetakeInterview = async () => {
    // Clear interview-related data but keep onboarding info
    sessionStorage.removeItem('interviewEvaluation');
    sessionStorage.removeItem('currentInterview');
    sessionStorage.removeItem('interviewConversationHistory');
    sessionStorage.removeItem('interviewCompleted');
    
    // Also clear any existing interview session from backend memory
    try {
      await fetch('/api/interview/reset', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Error clearing interview sessions:', error);
    }
    
    sessionStorage.setItem('interviewPhase', '2');
    setCurrentPhase(2);
    router.push('/interview');
  };

  const handleViewOfferLetter = () => {
    router.push('/offer');
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
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 className={styles.title}>Interview Progress Dashboard</h1>
          <p className={styles.subtitle}>Track your journey through the hiring process</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            style={{ width: `${((currentPhase - 1) / 5) * 100}%` }}
          />
        </div>
        <span className={styles.progressPercent}>
          {Math.round(((currentPhase - 1) / 5) * 100)}% Complete
        </span>
      </div>

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

      <div className={styles.actions}>
        <button onClick={handleReset} className={styles.resetButton}>
          Reset Progress
        </button>
      </div>

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
    </main>
  );
}
