'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './page.module.css';
import DashboardSkeleton from './DashboardSkeleton';
import HowToUseModal from '@/components/HowToUseModal';
import CandidateNavbar from '@/components/CandidateNavbar';
import confetti from 'canvas-confetti';
import { syncPhaseToDb } from '@/lib/phaseSync';

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

interface Attempt {
  id: string;
  status: string;
  overall_score: number | null;
  result: string | null;
  completedAt: string | null;
  startedAt: string | null;
}

// ── SVG Phase Step Icons ─────────────────────────────────────────────────────
function getPhaseStepIcon(phaseId: Phase) {
  switch (phaseId) {
    case 1:
      // Onboarding - User profile icon
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stepIconSvg}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 2:
      // Start Interview - Online interview via AI chat / evaluation bot
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stepIconSvg}>
          <path d="M12 5V2" />
          <path d="M9 2h6" />
          <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8z" />
          <circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="11" r="1.5" fill="currentColor" stroke="none" />
          <path d="M10 14c.7.7 1.3 1 2 1s1.3-.3 2-1" />
        </svg>
      );
    case 3:
      // Interview Summary - Evaluation report card with checkmark & score line
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stepIconSvg}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="m9 13 2 2 4-4" />
          <path d="M8 18h8" />
        </svg>
      );
    case 4:
      // Foundation Course - Graduation cap
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stepIconSvg}>
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      );
    case 5:
      // Ground Truth Module - Verified shield with checkmark
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stepIconSvg}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 6:
      // Upload Documents - Document with upload arrow
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.stepIconSvg}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M12 18v-6" />
          <path d="m9 15 3-3 3 3" />
        </svg>
      );
  }
}

// ── Sprout Mascot SVG (Animated) ─────────────────────────────────────────────
function SproutMascot() {
  return (
    <svg
      width="76"
      height="84"
      viewBox="0 0 100 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.sproutMascotSvg}
      aria-hidden="true"
    >
      {/* Sparkles around waving hand */}
      <g className={styles.sparklesGroup}>
        <path d="M85 30 L93 25" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M89 39 L97 39" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M83 47 L91 52" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* Feet */}
      <ellipse cx="38" cy="98" rx="5" ry="3.5" fill="#ffffff" stroke="#1b4332" strokeWidth="2.2" />
      <ellipse cx="58" cy="98" rx="5" ry="3.5" fill="#ffffff" stroke="#1b4332" strokeWidth="2.2" />

      {/* Left Arm (resting at side) */}
      <path d="M25 65 C20 67 18 73 21 78 C23 81 26 80 27 75" fill="#ffffff" stroke="#1b4332" strokeWidth="2.2" strokeLinecap="round" />

      {/* Body */}
      <path
        d="M48 30 C32 30 22 45 22 68 C22 90 32 99 48 99 C64 99 74 90 74 68 C74 45 64 30 48 30 Z"
        fill="#ffffff"
        stroke="#1b4332"
        strokeWidth="2.4"
      />

      {/* Soft Belly Shadow */}
      <path
        d="M26 75 C28 92 37 97 48 97 C59 97 68 92 70 75 C66 90 56 94 48 94 C40 94 30 90 26 75 Z"
        fill="#dcfce7"
        opacity="0.85"
      />

      {/* Right Arm (waving high with subtle animation) */}
      <path
        className={styles.wavingArm}
        d="M72 60 C78 55 83 46 84 38 C84 34 79 35 77 41 C74 48 71 55 69 63"
        fill="#ffffff"
        stroke="#1b4332"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Stem and Two Leaves on Head */}
      <path d="M48 30 C48 24 47 18 47 14" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M47 22 C37 20 30 11 36 6 C42 1 47 14 47 22 Z" fill="#84cc16" stroke="#15803d" strokeWidth="2" strokeLinejoin="round" />
      <path d="M47 22 C57 20 64 11 58 6 C52 1 47 14 47 22 Z" fill="#84cc16" stroke="#15803d" strokeWidth="2" strokeLinejoin="round" />

      {/* Eyes */}
      <circle cx="40" cy="58" r="3.2" fill="#1b4332" />
      <circle cx="41.2" cy="56.8" r="1" fill="#ffffff" />

      <circle cx="58" cy="58" r="3.2" fill="#1b4332" />
      <circle cx="59.2" cy="56.8" r="1" fill="#ffffff" />

      {/* Blush */}
      <ellipse cx="34" cy="65" rx="3.5" ry="2" fill="#f87171" opacity="0.45" />
      <ellipse cx="64" cy="65" rx="3.5" ry="2" fill="#f87171" opacity="0.45" />

      {/* Smile */}
      <path d="M46 65 Q49 70 52 65" stroke="#1b4332" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ── Confetti Celebration Animation ───────────────────────────────────────────
function triggerCelebrationConfetti() {
  try {
    // Initial vibrant burst
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#10b981', '#34d399', '#f59e0b', '#fbbf24', '#38bdf8', '#a855f7'],
      zIndex: 100001,
    });

    // Gentle side cannons lasting ~2.2s
    const duration = 2.2 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#10b981', '#34d399', '#f59e0b', '#fbbf24'],
        zIndex: 100001,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#10b981', '#34d399', '#f59e0b', '#fbbf24'],
        zIndex: 100001,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  } catch (err) {
    console.error('Confetti animation error:', err);
  }
}

export default function DashboardPage() {
  const [currentPhase, setCurrentPhase] = useState<Phase>(1);
  const [documentsSubmitted, setDocumentsSubmitted] = useState(false);
  const [foundationCompleted, setFoundationCompleted] = useState(false);
  const [moduleCompleted, setModuleCompleted] = useState(false);
  const [hasCompletedDocsCelebration, setHasCompletedDocsCelebration] = useState(false);
  const dbCelebratedPhasesRef = React.useRef<number[]>([]);
  const [celebrationPhase, setCelebrationPhase] = useState<string | null>(null);
  const [isExitingCelebration, setIsExitingCelebration] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [interviewResult, setInterviewResult] = useState<EvaluationResult | null>(null);
  const [hasCompletedInterview, setHasCompletedInterview] = useState(false);
  const [showAlreadyDoneDialog, setShowAlreadyDoneDialog] = useState(false);
  const [showNoAttemptsLeftDialog, setShowNoAttemptsLeftDialog] = useState(false);
  const [showCooldownDialog, setShowCooldownDialog] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showAttemptsModal, setShowAttemptsModal] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [cooldownTimeLeft, setCooldownTimeLeft] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const router = useRouter();

  useEffect(() => {
    // Map DB phase label → number (source of truth for pipeline progress)
    const DB_PHASE_NUM: Record<string, number> = {
      'onboarding': 1,
      'interview':  2,
      'summary':    3,
      'foundation': 4,
      'module':     5,
      'documents':  6,
    };

    const checkProfile = async () => {
      try {
        const response = await fetch('/api/candidate');

        if (response.status === 401) {
          sessionStorage.removeItem('candidate_session_token');
          router.push('/post-login?callbackUrl=/dashboard');
          return;
        }

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
        const fcDone              = lsFoundationCompleted || !!candidate.foundationCourseCompleted;
        const lsModuleCompleted   = localStorage.getItem('moduleCompleted') === 'true' || localStorage.getItem('moduleCompleted') === 'completed';
        const modDone             = lsModuleCompleted || !!candidate.moduleCompleted;
        setDocumentsSubmitted(docsSubmitted);
        setFoundationCompleted(fcDone);
        setModuleCompleted(modDone);

        const dbCelebrated: number[] = candidate.celebratedPhases ?? [];
        dbCelebratedPhasesRef.current = dbCelebrated;

        const candidateKey =
          sessionStorage.getItem('candidateId') ||
          sessionStorage.getItem('candidateEmail') ||
          localStorage.getItem('candidateEmail') ||
          localStorage.getItem('candidateName') ||
          candidate.email ||
          candidate.id ||
          'default_candidate';
        const storageKey = `celebrated_completed_phases_${candidateKey}`;
        let celebratedInLs = false;
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored && JSON.parse(stored).includes(6)) {
            celebratedInLs = true;
          }
        } catch {}

        if (docsSubmitted && (dbCelebrated.includes(6) || celebratedInLs)) {
          setHasCompletedDocsCelebration(true);
        } else {
          setHasCompletedDocsCelebration(false);
        }

        // 4. Reconstruct actual phase from DB phase + flags
        let actualPhase: Phase = dbPhaseNum;

        if (fcDone  && actualPhase < 5) actualPhase = 5;
        if (modDone && actualPhase < 6) actualPhase = 6;
        if (docsSubmitted && actualPhase < 6) actualPhase = 6;

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

        if (candidate.foundationVideoCompleted) {
          localStorage.setItem('foundation_video_completed', 'true');
        }

        if (candidate.moduleCompleted) {
          localStorage.setItem('moduleCompleted', 'completed');
        } else if (!lsModuleCompleted) {
          localStorage.removeItem('moduleCompleted');
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
        const justCompleted = sessionStorage.getItem('interviewJustCompleted') === 'true'
          || localStorage.getItem('interviewJustCompleted') === 'true';
        if (actualPhase >= 3 && justCompleted && !summaryVisited) {
          sessionStorage.removeItem('interviewJustCompleted');
          localStorage.removeItem('interviewJustCompleted');
          setTimeout(() => router.push('/summary'), 500);
        } else {
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
          setAttempts(data.attempts ?? []);
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

    const init = async () => {
      try {
        await Promise.all([checkProfile(), loadAttempts()]);
      } finally {
        setIsLoading(false);
      }
    };
    init();
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
  const isInterviewCompleted = hasPassed || attempts.length >= 3;
  const isInterviewFailedAllAttempts = attempts.length >= 3 && !hasPassed;

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
      status: isInterviewCompleted
        ? 'completed'
        : currentPhase >= 2
        ? 'current'
        : 'locked',
    },
    {
      id: 3,
      name: 'Interview Summary',
      description: 'View your interview results and scores',
      status: hasPassed
        ? 'completed'
        : (attempts.length > 0 || currentPhase >= 3)
        ? 'current'
        : 'locked',
    },
    {
      id: 4,
      name: 'Foundation Course',
      description: 'Complete the foundation course to unlock Ground Truth Module',
      status: (foundationCompleted || currentPhase > 4) ? 'completed' : currentPhase === 4 ? 'current' : 'locked',
    },
    {
      id: 5,
      name: 'Ground Truth Module',
      description: 'Complete the tasks on Ground Truth Module to unlock document upload',
      status: (moduleCompleted || currentPhase > 5) ? 'completed' : currentPhase === 5 ? 'current' : 'locked',
    },
    {
      id: 6,
      name: 'Upload Documents',
      description: 'Submit required documents to complete the process',
      status: documentsSubmitted ? 'completed' : currentPhase === 6 ? 'current' : 'locked',
    },
  ];

  // ── Auto-dismiss celebration banner: 1.8s rise + 3s stay + smooth sink ──
  useEffect(() => {
    if (!celebrationPhase) {
      setIsExitingCelebration(false);
      return;
    }
    setIsExitingCelebration(false);

    // Takes ~1.8s to rise smoothly from bottom to center, then stays at center for 3 seconds
    const exitTimer = setTimeout(() => {
      setIsExitingCelebration(true);
    }, 4800); // 1.8s rise + 3.0s stay = 4.8s

    // After exit animation completes (5.4s total), clear celebration state
    const closeTimer = setTimeout(() => {
      if (celebrationPhase === 'Upload Documents') {
        setHasCompletedDocsCelebration(true);
      }
      setCelebrationPhase(null);
      setIsExitingCelebration(false);
    }, 5400);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  }, [celebrationPhase]);

  const handleCloseCelebration = () => {
    setIsExitingCelebration(true);
    setTimeout(() => {
      if (celebrationPhase === 'Upload Documents') {
        setHasCompletedDocsCelebration(true);
      }
      setCelebrationPhase(null);
      setIsExitingCelebration(false);
    }, 350);
  };

  // ── Single-time Celebration trigger when eligible phase is completed ──────
  useEffect(() => {
    if (isLoading) return;

    // Unique candidate identifier to ensure per-candidate tracking
    const candidateKey =
      sessionStorage.getItem('candidateId') ||
      sessionStorage.getItem('candidateEmail') ||
      localStorage.getItem('candidateEmail') ||
      localStorage.getItem('candidateName') ||
      'default_candidate';

    const storageKey = `celebrated_completed_phases_${candidateKey}`;

    let celebratedIds: number[] = [];
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) celebratedIds = JSON.parse(stored);
    } catch {
      celebratedIds = [];
    }

    // Merge with DB celebrated phases (source of truth surviving logout/login)
    const dbCelebrated = dbCelebratedPhasesRef.current || [];
    celebratedIds = Array.from(new Set([...celebratedIds, ...dbCelebrated]));

    // Determine highest completed milestone eligible for celebration:
    // Phase 3 summary never celebrates. Phase 1, 2, 4, 5, 6 celebrate once upon completion.
    let highestCompletedMilestone: { id: number; name: string } | null = null;

    if (documentsSubmitted) {
      highestCompletedMilestone = { id: 6, name: 'Upload Documents' };
    } else if (moduleCompleted || currentPhase > 5) {
      highestCompletedMilestone = { id: 5, name: 'Ground Truth Module' };
    } else if (foundationCompleted || currentPhase > 4) {
      highestCompletedMilestone = { id: 4, name: 'Foundation Course' };
    } else if (hasPassed && currentPhase <= 4 && !foundationCompleted && !moduleCompleted && !documentsSubmitted) {
      highestCompletedMilestone = { id: 2, name: 'Start Interview' };
    } else if (currentPhase >= 2 && !hasPassed && attempts.length === 0) {
      highestCompletedMilestone = { id: 1, name: 'Onboarding' };
    }

    if (!highestCompletedMilestone) {
      return;
    }

    // If this milestone has already been celebrated, do NOT trigger again!
    if (celebratedIds.includes(highestCompletedMilestone.id)) {
      if (highestCompletedMilestone.id === 6) {
        setHasCompletedDocsCelebration(true);
      }
      return;
    }

    // Milestone is newly completed and uncelebrated! Celebrate it now!
    const milestoneId = highestCompletedMilestone.id;
    // Auto-mark this milestone and all earlier milestones as celebrated
    const priorIds = [1, 2, 4, 5, 6].filter((id) => id <= milestoneId);
    const updatedCelebrated = Array.from(new Set([...celebratedIds, ...priorIds]));

    // Persist immediately in localStorage
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedCelebrated));
    } catch {}

    // Update in-memory ref
    dbCelebratedPhasesRef.current = updatedCelebrated;

    // Persist to database so it survives across sessions, refreshes, and devices
    syncPhaseToDb(currentPhase, { celebratedPhases: updatedCelebrated });

    if (milestoneId === 6) {
      // Hold center modal hidden until celebration banner finishes
      setHasCompletedDocsCelebration(false);
    }

    // Trigger celebratory banner + confetti immediately
    triggerCelebrationConfetti();
    setCelebrationPhase(highestCompletedMilestone.name);
  }, [isLoading, currentPhase, documentsSubmitted, foundationCompleted, moduleCompleted, hasPassed, attempts.length]);

  const handlePhaseClick = async (phase: PhaseInfo) => {
    // Once documents and all journey steps are completed, candidate does not need to click any phases
    if (documentsSubmitted) {
      return;
    }

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
            router.push('/post-login?callbackUrl=/interview');
          } else {
            router.push('/interview/queue');
          }
          break;
        case 3:
          router.push('/summary');
          break;
        case 4:
          if (foundationCompleted) {
            router.push('/foundation-course');
          } else if (typeof window !== 'undefined' && localStorage.getItem('foundation_video_completed') === 'true') {
            router.push('/foundation-course');
          } else {
            router.push('/foundation-course/video');
          }
          break;
        case 5:
          router.push('/module');
          break;
        case 6:
          router.push('/upload-documents');
          break;
      }
    }
  };

  // 100% Original completion percentage calculation logic preserved
  const getCompletionPercentage = () => {
    if (documentsSubmitted) return 100;
    if (moduleCompleted || currentPhase === 6) return 80;
    if (foundationCompleted || currentPhase === 5) return 60;
    if (currentPhase === 4) return 40;
    if (currentPhase === 3) {
      return hasPassed ? 40 : 20;
    }
    if (currentPhase === 2) return 20;
    return 0;
  };

  const completionPercentage = getCompletionPercentage();


  // Dynamic Sprout Speech Bubble Message based on pipeline status
  const getMascotMessage = () => {
    // If candidate took an interview attempt and did not pass
    if (attempts.length > 0 && !hasPassed) {
      const remainingAttempts = 3 - attempts.length;
      if (hasAttemptsLeft) {
        if (cooldownTimeLeft) {
          return (
            <>
              Interview attempt not cleared — cooldown active ({cooldownTimeLeft}). Please re-attempt your interview once cooldown expires ({remainingAttempts} attempt{remainingAttempts > 1 ? 's' : ''} left)! 🎯
            </>
          );
        }
        return (
          <>
            Interview attempt not cleared — Please re-attempt your interview.
          </>
        );
      }
      return (
        <>
          Interview not cleared — all 3 attempts completed.
        </>
      );
    }

    if (cooldownTimeLeft) {
      return (
        <>
          Interview cooldown active — take a breather before retrying! ⏳
        </>
      );
    }
    if (documentsSubmitted) {
      return (
        <>
          All done! You have completed all journey steps successfully. 🌟
        </>
      );
    }
    if (currentPhase === 1) {
      return (
        <>
          Welcome! Complete your <strong>onboarding</strong> to begin your interview journey! 🌱
        </>
      );
    }
    if (currentPhase === 2) {
      return (
        <>
          Step 2 unlocked — it&apos;s time for your <strong>interview</strong>! 🎉
        </>
      );
    }
    if (currentPhase === 3) {
      if (hasPassed) {
        return (
          <>
            Awesome job! You passed your interview — check your <strong>summary</strong>! 🏆
          </>
        );
      }
      return (
        <>
          Interview attempt completed — review your <strong>scores & summary</strong>! 📋
        </>
      );
    }
    if (currentPhase === 4) {
      return (
        <>
          Step 4 unlocked — complete the <strong>foundation course</strong> to keep moving! 🎓
        </>
      );
    }
    if (currentPhase === 5) {
      return (
        <>
          Step 5 unlocked — work on the <strong>ground truth module</strong>! 📊
        </>
      );
    }
    if (currentPhase === 6) {
      return (
        <>
          Final step — <strong>upload your documents</strong> to complete your hiring process! 📁
        </>
      );
    }
    return <>Complete each step to move forward. You&apos;re doing great! ✨</>;
  };

  // Contextual Tips for candidates
  const getTipMessage = () => {
    if (documentsSubmitted) {
      return 'All documents submitted successfully. Our hiring team will review your application and connect with you shortly with next steps!';
    }
    if (currentPhase === 3 || (currentPhase === 2 && attempts.length > 0)) {
      return 'Review your result score in the interview summary. You can also request a re-evaluation from the interview summary page.';
    }
    if (currentPhase === 2) {
      return 'Find a quiet place with a stable internet connection to ensure a smooth interview experience.';
    }
    if (currentPhase === 1) {
      return 'Ensure your full name, email, and mobile number match your official documents before submitting.';
    }
    if (currentPhase === 4) {
      return 'Sign in or sign up on ViBe using your registered email address to verify course completion.';
    }
    if (currentPhase === 5) {
      return 'Follow all Ground Truth Application instructions carefully to ensure quick approval.';
    }
    if (currentPhase === 6) {
      return 'Ensure document scans or images are clear, legible, and match your submitted profile.';
    }
    return 'Find a quiet place with a stable internet connection to ensure a smooth interview experience.';
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <main className={styles.container}>
      {/* Background organic gradients */}
      <div className={styles.bgDecoration} aria-hidden="true">
        <div className={styles.bgWaveTopLeft} />
        <div className={styles.bgWaveBottomRight} />
      </div>

      {/* Top Navbar */}
      <CandidateNavbar />

      {/* Main Content */}
      <div className={styles.contentContainer}>
        {/* Centered Hero Header + Centered Action Buttons Below */}
        <section className={styles.heroSection}>
          <div className={styles.heroCenter}>
            <h1 className={styles.journeyTitle}>
              Your <span className={styles.titleHighlight}>Interview Journey</span>
            </h1>
            <p className={styles.journeySubtitle}>
              Complete each step to move forward. You&apos;re doing great! ✨
            </p>
          </div>

          {/* Action Row: 3 Action Buttons on the left + White Progress Card on the right */}
          <div className={styles.topActionsRow}>
            <div className={styles.topButtonsGroup}>
              {/* 1. Important Instructions */}
              <button
                type="button"
                className={styles.pillButton}
                onClick={() => setShowInstructionsModal(true)}
                title="Important Instructions"
              >
                <svg
                  className={styles.pillIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
                <span>Important Instructions</span>
              </button>

              {/* 2. Interview Attempts */}
              <button
                type="button"
                className={styles.pillButton}
                onClick={() => setShowAttemptsModal(true)}
                title="Interview Attempts"
              >
                <svg
                  className={styles.pillIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Interview Attempts</span>
                <span className={styles.attemptsPillBadge}>{attempts.length}/3</span>
              </button>

              {/* 3. Watch Tutorial */}
              <button
                type="button"
                className={styles.pillButton}
                onClick={() => setShowVideoModal(true)}
                title="Watch Tutorial"
              >
                <span className={styles.playIconCircle}>▶</span>
                <span>Watch Tutorial</span>
              </button>
            </div>

            {/* Overall Progress White Container (as in reference mockup) */}
            <div className={styles.progressCard}>
              <div className={styles.progressCardHeader}>
                <span className={styles.progressCardTitle}>Overall Progress</span>
                <span className={styles.progressCardCount}>
                  {phases.filter((p) => p.status === 'completed').length} / 6 Completed
                </span>
              </div>
              <div className={styles.progressCardBarRow}>
                <div className={styles.progressCardTrack}>
                  <div
                    className={styles.progressCardFill}
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
                <span className={styles.progressCardPercent}>{completionPercentage}%</span>
              </div>
            </div>
          </div>
        </section>

        {/* Journey Stepper (Horizontal Timeline matching reference) */}
        <section className={styles.stepperWrapper}>
          <div className={styles.stepperRow}>
            {phases.map((phase, index) => {
              const isPulsing = phase.status === 'current' && !(phase.id === 3 && !isInterviewCompleted);
              const isFailedCompleted = phase.id === 2 && isInterviewFailedAllAttempts;

              return (
                <React.Fragment key={phase.id}>
                  <div
                    className={`${styles.stepNode} ${styles[phase.status]} ${
                      phase.status === 'current' && !isPulsing ? styles.noPulse : ''
                    }`}
                    onClick={() => handlePhaseClick(phase)}
                    role="button"
                    tabIndex={phase.status !== 'locked' ? 0 : -1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePhaseClick(phase);
                      }
                    }}
                    title={`${phase.name}: ${phase.description}`}
                  >
                    <div className={styles.circleOuter}>
                      {/* Active Radar Beacon Ripple (Interactive wow effect) */}
                      {isPulsing && (
                        <span className={styles.radarRing} aria-hidden="true" />
                      )}

                      {/* Top Number Badge */}
                      <span className={styles.topBadge}>{phase.id}</span>

                      {/* Main Inner Icon */}
                      <div className={styles.circleInner}>
                        {getPhaseStepIcon(phase.id)}
                      </div>

                      {/* Bottom Status Badge */}
                      {phase.status === 'completed' && (
                        <span className={styles.bottomBadge}>
                          {isFailedCompleted ? (
                            <svg viewBox="0 0 12 12" className={styles.badgeSvg}>
                              <path
                                d="M3 3L9 9M9 3L3 9"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 12 12" className={styles.badgeSvg}>
                              <path
                                d="M2.5 6.5L4.8 8.8L9.5 3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                      )}
                    {phase.status === 'locked' && (
                      <span className={styles.bottomBadge}>
                        <svg viewBox="0 0 12 12" className={styles.badgeSvg}>
                          <rect x="2.5" y="5" width="7" height="5.5" rx="1" fill="currentColor" />
                          <path
                            d="M4 5V3.5a2 2 0 1 1 4 0V5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    )}
                  </div>

                  {/* Step Label */}
                  <span className={styles.stepTitle}>{phase.name}</span>
                </div>

                {/* Connector Line to next step */}
                {index < phases.length - 1 && (
                  <div
                    className={`${styles.stepConnector} ${
                      phase.status === 'completed' ? styles.connectorActive : styles.connectorInactive
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
          </div>
        </section>


        {/* Mascot & Tip Banner (Bottom Card matching reference) */}
        <section className={styles.mascotBannerCard}>
          <div className={styles.mascotSection}>
            <div className={styles.sproutMascotWrapper}>
              <SproutMascot />
            </div>
            <div className={styles.speechBubble}>
              {getMascotMessage()}
            </div>
          </div>

          <div className={styles.bannerDivider} />

          <div className={styles.tipSection}>
            <span className={styles.tipIcon}>💡</span>
            <div className={styles.tipContent}>
              <span className={styles.tipLabel}>Tip</span>
              <p className={styles.tipText}>{getTipMessage()}</p>
            </div>
          </div>
        </section>

        {/* Cooldown Active Banner */}
        {cooldownTimeLeft && (
          <section className={styles.cooldownBanner}>
            <span className={styles.cooldownIcon}>⏳</span>
            <div className={styles.cooldownTextGroup}>
              <h2 className={styles.cooldownTitle}>Interview Cooldown Active</h2>
              <p className={styles.cooldownDescription}>
                You can retry the interview after <strong>{cooldownTimeLeft}</strong>.
              </p>
            </div>
          </section>
        )}
      </div>

      {/* Phase Completion Celebration Banner held by Mascot Avatar */}
      {celebrationPhase && (
        <div
          className={`${styles.celebrationOverlay} ${
            isExitingCelebration ? styles.celebrationOverlayExiting : ''
          }`}
          onClick={handleCloseCelebration}
        >
          <div
            className={`${styles.avatarBannerWrapper} ${
              isExitingCelebration ? styles.avatarBannerWrapperExiting : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Held Celebration Poster / Banner Card (Raised ABOVE Avatar's Head) */}
            <div className={styles.heldPosterCard}>
              <button
                type="button"
                className={styles.bannerCloseBtn}
                onClick={handleCloseCelebration}
                title="Close"
              >
                ✕
              </button>

              <div className={styles.bannerContent}>
                <span className={styles.celebrationTag}>
                  {celebrationPhase === 'Onboarding'
                    ? '🎉 Onboarding Completed!'
                    : celebrationPhase === 'Start Interview'
                    ? '🎉 Interview Passed!'
                    : celebrationPhase === 'Foundation Course'
                    ? '🎉 Foundation Course Completed!'
                    : celebrationPhase === 'Ground Truth Module'
                    ? '🎉 Ground Truth Module Completed!'
                    : celebrationPhase === 'Upload Documents'
                    ? '🎉 Document Submission Completed!'
                    : '🎉 Phase Completed!'}
                </span>
                <h2 className={styles.bannerTitle}>Congratulations!</h2>
                <p className={styles.bannerMessage}>
                  {celebrationPhase === 'Onboarding' ? (
                    <>
                      You completed your <strong>Onboarding</strong>! 🎉
                    </>
                  ) : celebrationPhase === 'Start Interview' ? (
                    <>
                      You passed your <strong>Interview</strong>! 🎉
                    </>
                  ) : celebrationPhase === 'Foundation Course' ? (
                    <>
                      You completed the <strong>Foundation Course</strong>! 🎉
                    </>
                  ) : celebrationPhase === 'Ground Truth Module' ? (
                    <>
                      You completed the <strong>Ground Truth Module</strong>! 🎉
                    </>
                  ) : celebrationPhase === 'Upload Documents' ? (
                    <>
                      You completed <strong>document submission</strong>! 🎉
                    </>
                  ) : (
                    <>
                      You completed <strong>{celebrationPhase}</strong>!
                    </>
                  )}
                </p>
                <p className={styles.bannerSub}>
                  {celebrationPhase === 'Onboarding'
                    ? "Great job! Your profile is all set. You can now proceed to your AI Interview! ✨"
                    : celebrationPhase === 'Start Interview'
                    ? "Great job! You've successfully passed the interview. Complete each step to move forward! ✨"
                    : celebrationPhase === 'Foundation Course'
                    ? "Awesome progress! Proceed to the Ground Truth Module to continue. ✨"
                    : celebrationPhase === 'Ground Truth Module'
                    ? "Fantastic! You've unlocked Document Upload. You're almost there! ✨"
                    : celebrationPhase === 'Upload Documents'
                    ? "Our hiring team will connect with you soon! 🌟"
                    : "Complete each step to move forward. You're doing great! ✨"}
                </p>
              </div>

              {/* 3-second animated countdown timer bar */}
              <div className={styles.timerBarTrack} title="Closes automatically in 3 seconds">
                <div className={styles.timerBarFill} />
              </div>
            </div>

            {/* Mascot Avatar Raising Hands Up Holding Banner Above Head */}
            <div className={styles.mascotHolder}>
              <svg
                viewBox="0 0 160 120"
                className={styles.mascotHoldingSvg}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* Left & Right Celebratory Sparkles */}
                <g className={styles.sparklesGroup}>
                  <path d="M26 34 L16 28" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M22 46 L10 46" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M28 58 L18 64" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />

                  <path d="M134 34 L144 28" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M138 46 L150 46" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
                  <path d="M132 58 L142 64" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" />
                </g>

                {/* Feet */}
                <ellipse cx="68" cy="110" rx="8" ry="4.5" fill="#ffffff" stroke="#1b4332" strokeWidth="2.4" />
                <ellipse cx="92" cy="110" rx="8" ry="4.5" fill="#ffffff" stroke="#1b4332" strokeWidth="2.4" />

                {/* Body */}
                <path
                  d="M80 34 C58 34 46 50 46 76 C46 96 58 106 80 106 C102 106 114 96 114 76 C114 50 102 34 80 34 Z"
                  fill="#ffffff"
                  stroke="#1b4332"
                  strokeWidth="2.8"
                />

                {/* Belly soft light green tint */}
                <path
                  d="M54 86 C58 98 68 103 80 103 C92 103 102 98 106 86 C100 96 90 100 80 100 C70 100 60 96 54 86 Z"
                  fill="#dcfce7"
                  opacity="0.85"
                />

                {/* Left Arm reaching UP holding the bottom of the banner */}
                <path
                  d="M56 64 C42 54 36 32 46 12 C50 12 52 16 52 22 C45 36 50 48 64 58 Z"
                  fill="#ffffff"
                  stroke="#1b4332"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />

                {/* Right Arm reaching UP holding the bottom of the banner */}
                <path
                  d="M104 64 C118 54 124 32 114 12 C110 12 108 16 108 22 C115 36 110 48 96 58 Z"
                  fill="#ffffff"
                  stroke="#1b4332"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />

                {/* Left Paw holding banner bottom rim */}
                <ellipse cx="46" cy="10" rx="8.5" ry="5.5" fill="#ffffff" stroke="#1b4332" strokeWidth="2.5" />

                {/* Right Paw holding banner bottom rim */}
                <ellipse cx="114" cy="10" rx="8.5" ry="5.5" fill="#ffffff" stroke="#1b4332" strokeWidth="2.5" />

                {/* Head Stem and Two Leaves (proudly between raised arms) */}
                <path d="M80 34 C80 27 79 20 79 16" stroke="#15803d" strokeWidth="2.8" strokeLinecap="round" />
                <path d="M79 24 C67 22 58 12 65 6 C73 1 79 15 79 24 Z" fill="#84cc16" stroke="#15803d" strokeWidth="2.2" strokeLinejoin="round" />
                <path d="M79 24 C91 22 100 12 93 6 C85 1 79 15 79 24 Z" fill="#84cc16" stroke="#15803d" strokeWidth="2.2" strokeLinejoin="round" />

                {/* Cute Happy Eyes */}
                <circle cx="68" cy="62" r="4.2" fill="#1b4332" />
                <circle cx="69.6" cy="60.4" r="1.3" fill="#ffffff" />

                <circle cx="92" cy="62" r="4.2" fill="#1b4332" />
                <circle cx="93.6" cy="60.4" r="1.3" fill="#ffffff" />

                {/* Cheerful Blush Cheeks */}
                <ellipse cx="60" cy="70" rx="4.5" ry="2.6" fill="#f87171" opacity="0.5" />
                <ellipse cx="100" cy="70" rx="4.5" ry="2.6" fill="#f87171" opacity="0.5" />

                {/* Big Happy Smile */}
                <path d="M75 70 Q80 77 85 70" stroke="#1b4332" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Centered Completion Banner Modal (shown when documents submitted & congrats banner has finished) */}
      {documentsSubmitted && !celebrationPhase && !isExitingCelebration && hasCompletedDocsCelebration && (
        <div className={styles.completionOverlay} aria-modal="true" role="dialog">
          <div className={styles.completionDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.completionHeader}>
              <div className={styles.completionBadge}>
                <span className={styles.completionBadgeDot} />
                <span>Journey Complete</span>
              </div>
              <span className={styles.completionProgressText}>6 / 6 Steps Completed ✨</span>
            </div>

            <div className={styles.completionBannerContent}>
              <div className={styles.mascotSection}>
                <div className={styles.sproutMascotWrapper}>
                  <SproutMascot />
                </div>
                <div className={styles.speechBubble}>
                  {getMascotMessage()}
                </div>
              </div>

              <div className={styles.bannerDivider} />

              <div className={styles.tipSection}>
                <span className={styles.tipIcon}>💡</span>
                <div className={styles.tipContent}>
                  <span className={styles.tipLabel}>Next Steps</span>
                  <p className={styles.tipText}>{getTipMessage()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial Video Modal */}
      {showVideoModal && (
        <HowToUseModal onClose={() => setShowVideoModal(false)} videoUrl="https://youtu.be/D22IYyDw5ME" />
      )}

      {/* Important Instructions Modal */}
      {showInstructionsModal && (
        <div className={styles.popupOverlay} onClick={() => setShowInstructionsModal(false)}>
          <div className={styles.popupDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popupIcon}>📋</div>
            <h2 className={styles.popupTitle}>Important Instructions</h2>
            <p className={styles.popupMessage}>Please review the candidate guidelines carefully:</p>
            <ol className={styles.instructionsModalList}>
              <li>The candidate will be allowed a maximum of 3 attempts.</li>
              <li>On failing the interview there will be a cooldown period after which candidate is allowed next attempt.</li>
              <li>Please read the interview instructions carefully, failing which may lead to interview closure.</li>
            </ol>
            <div className={styles.popupButtons}>
              <button
                type="button"
                className={styles.popupPrimaryButton}
                onClick={() => setShowInstructionsModal(false)}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interview Attempts Modal */}
      {showAttemptsModal && (
        <div className={styles.popupOverlay} onClick={() => setShowAttemptsModal(false)}>
          <div className={`${styles.popupDialog} ${styles.attemptsModalDialog}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.attemptsModalHeader}>
              <div className={styles.attemptsModalIcon}>🎯</div>
              <div className={styles.attemptsModalTitleGroup}>
                <h2 className={styles.attemptsModalTitle}>Interview Attempts</h2>
                <p className={styles.attemptsModalSub}>
                  Maximum 3 attempts permitted • <strong>{attempts.length}/3</strong> used
                </p>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowAttemptsModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className={styles.attemptsModalBody}>
              {cooldownTimeLeft && (
                <div className={styles.modalCooldownAlert}>
                  <span>⏳</span>
                  <span>Cooldown Active — Retry available in <strong>{cooldownTimeLeft}</strong></span>
                </div>
              )}

              {attempts.length === 0 ? (
                <div className={styles.attemptsEmptyState}>
                  <div className={styles.emptyIcon}>📝</div>
                  <p className={styles.emptyTitle}>No Attempts Yet</p>
                  <p className={styles.emptyDesc}>
                    You haven&apos;t taken an interview session yet. Your scores, evaluation results, and dates will appear here once you take an interview.
                  </p>
                </div>
              ) : (
                <div className={styles.attemptsModalList}>
                  {attempts.map((attempt, index) => {
                    const date = (attempt.completedAt
                      ? new Date(attempt.completedAt)
                      : attempt.startedAt
                      ? new Date(attempt.startedAt)
                      : null
                    )?.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }) ?? '—';

                    const isEvaluating = !attempt.result || attempt.result === 'PROCESSING';
                    const isFail = attempt.result === 'FAIL';
                    const isPass = attempt.result === 'PASS';

                    const badgeClass =
                      isPass
                        ? styles.badgePass
                        : isFail
                        ? styles.badgeFail
                        : attempt.result === 'WITHDRAWN'
                        ? styles.badgeWithdrawn
                        : attempt.result === 'ANTI_CHEAT'
                        ? styles.badgeAntiCheat
                        : isEvaluating
                        ? styles.badgeProcessing
                        : styles.badgeCompleted;

                    return (
                      <div key={attempt.id} className={styles.modalAttemptCard}>
                        <div className={styles.modalAttemptTop}>
                          <div className={styles.attemptBadgeGroup}>
                            <span className={styles.modalAttemptNum}>Attempt #{index + 1}</span>
                            <span className={badgeClass}>{isEvaluating ? '⏳ PROCESSING' : attempt.result ?? 'COMPLETED'}</span>
                          </div>
                          <span className={styles.modalAttemptScore}>
                            Score: <strong>{isEvaluating ? 'Processing...' : (attempt.overall_score != null ? `${attempt.overall_score}/100` : (isFail ? '0/100' : '—'))}</strong>
                          </span>
                        </div>
                        <div className={styles.modalAttemptBottom}>
                          <span className={styles.modalAttemptDate}>📅 {date}</span>
                          {attempt.status && (
                            <span className={styles.modalAttemptStatus}>Status: {isEvaluating ? 'evaluating' : attempt.status}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.popupButtons}>
              <button
                type="button"
                className={styles.popupPrimaryButton}
                onClick={() => setShowAttemptsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
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
                type="button"
                className={styles.popupSecondaryButton}
                onClick={() => setShowAlreadyDoneDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
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
                type="button"
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
              {cooldownTimeLeft ? (
                <>
                  You can retry the interview in <strong>{cooldownTimeLeft}</strong>.
                </>
              ) : (
                'You are currently in cooldown and cannot start a new interview yet.'
              )}
            </p>
            <div className={styles.popupButtons}>
              <button
                type="button"
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
