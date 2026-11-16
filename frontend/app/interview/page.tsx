'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';
import { useAntiCheat, type ViolationType, type ViolationLogDetails } from '@/hooks/useAntiCheat';
import { useVisualViewportVars } from '@/hooks/useVisualViewportVars';
import { interceptAuthFetch, authFetch } from '@/lib/auth-fetch';
import AntiCheatOverlay from '@/components/AntiCheatOverlay';
import CandidateNavbar from '@/components/CandidateNavbar';

interface Message {
  role: 'ai' | 'user';
  phase?: 'core' | 'rapid_fire';
  options?: string[];
  questionNumber?: number;
  totalQuestions?: number;
  topic?: string;
  imageUrl?: string | null;
  content: string;
  evaluation?: {
    score: number;
    strengths: string[];
    weaknesses: string[];
    feedback: string;
  };
}

interface ConversationHistory {
  question: string;
  answer: string;
  evaluation?: {
    score: number;
    strengths: string[];
    weaknesses: string[];
    feedback: string;
  };
}

interface CumulativeEvaluation {
  average_score: number;
  total_questions: number;
  performance_trend: string;
  difficulty_level: string;
}

export default function InterviewPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationHistory[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<CumulativeEvaluation | null>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [showStarting, setShowStarting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEndConfirmDialog, setShowEndConfirmDialog] = useState(false);
  const [showBackConfirmDialog, setShowBackConfirmDialog] = useState(false);
  const [isInterviewCompleted, setIsInterviewCompleted] = useState(false);
  const [cheatWarning, setCheatWarning] = useState<{
    visible: boolean
    type: ViolationType | null
    count: number
  }>({ visible: false, type: null, count: 0 });
  const [isClosing, setIsClosing] = useState(false);
  const [showClosingPage, setShowClosingPage] = useState(false);
  const [closingInterviewId, setClosingInterviewId] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string>('');
  const [idleThresholdMs, setIdleThresholdMs] = useState<number>(15_000);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(-1);
  const [startTimeMs, setStartTimeMs] = useState<number | null>(null);

  // Structured Assessment (13 Core + 12 Rapid-Fire Questions = 25 Total)
  const [currentPhase, setCurrentPhase] = useState<'core' | 'rapid_fire'>('core');
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(1);
  const [totalQuestions, setTotalQuestions] = useState<number>(25);
  const [currentTopic, setCurrentTopic] = useState<string | null>('agricultural_concepts');
  const [currentOptions, setCurrentOptions] = useState<string[] | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [rapidFireTimeoutsCount, setRapidFireTimeoutsCount] = useState<number>(0);
  const [questionTimeLimit, setQuestionTimeLimit] = useState<number>(120);
  const [questionTimeRemaining, setQuestionTimeRemaining] = useState<number>(120);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef(false);

  // Question countdown timer refs
  const questionStartMsRef = useRef<number>(Date.now());
  const questionTimeLimitRef = useRef<number>(questionTimeLimit);
  const hasTimedOutRef = useRef<boolean>(false);
  const latestInputRef = useRef(input);
  const latestSelectedOptionRef = useRef(selectedOption);
  const latestPhaseRef = useRef(currentPhase);

  latestInputRef.current = input;
  latestSelectedOptionRef.current = selectedOption;
  latestPhaseRef.current = currentPhase;
  questionTimeLimitRef.current = questionTimeLimit;

  // Anti-cheat: warning callback
  const handleCheatViolation = useCallback((type: ViolationType, count: number) => {
    setCheatWarning({ visible: true, type, count })
  }, [])

  // Anti-cheat: termination callback
  const handleCheatTerminate = useCallback(async (type: ViolationType) => {
    setCheatWarning(v => ({ ...v, visible: false }))

    if (interviewId) {
      await endInterviewAndClose(interviewId, 'anti_cheat')
    } else {
      // No interview ID yet — just redirect to dashboard
      router.push('/dashboard')
    }
  }, [interviewId, router])

  // Anti-cheat: log violation to backend (fire-and-forget)
  const handleCheatLog = useCallback((type: ViolationType, details?: ViolationLogDetails) => {
    authFetch('/api/anti-cheat/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId,
        interviewId: interviewId || null,
        eventType: type,
        severity: 'warning',
        message: details?.message ?? null,
        metadata: details?.metadata ? JSON.stringify(details.metadata) : null,
      }),
    }).catch(() => {})  // silently ignore errors — don't affect interview
  }, [interviewId, candidateId])

  const { reset: resetAntiCheat, recordViolation } = useAntiCheat({
    onViolation: handleCheatViolation,
    onTerminate: handleCheatTerminate,
    onLogEvent: handleCheatLog,
    enabled: !showInstructions && !isComplete && !isInterviewCompleted && !showClosingPage && !showStarting && !showResumePrompt && !isReconnecting,
    idleThresholdMs,
  })

  // Auto-attach Authorization: Bearer token to ALL fetch calls on this page
  useEffect(() => {
    const restore = interceptAuthFetch()
    return restore
  }, [])

  // Restore stored interview session and start time from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('currentInterview');
      if (stored) {
        const { interviewId: storedId, startedAt } = JSON.parse(stored);
        if (storedId) {
          setInterviewId((prev) => prev || storedId);
        }
        if (startedAt) {
          setStartTimeMs((prev) => prev || new Date(startedAt).getTime());
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Capture interview start time when interview begins
  useEffect(() => {
    if (interviewId && !showInstructions) {
      // Use stored startTime from localStorage if available (survives page refresh)
      try {
        const stored = localStorage.getItem('currentInterview');
        if (stored) {
          const { startedAt } = JSON.parse(stored);
          if (startedAt) {
            setStartTimeMs(new Date(startedAt).getTime());
            return;
          }
        }
      } catch { /* ignore */ }
      // Fallback to now if no stored start time
      setStartTimeMs(Date.now());
    }
  }, [interviewId, showInstructions]);

  // Timer: compute remaining time from startTimeMs every second (whole seconds only)
  useEffect(() => {
    if (!startTimeMs || showInstructions) return;

    const MAX_DURATION_SECONDS = 30 * 60; // 30 minutes — synced to backend default

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTimeMs) / 1000);
      setTimeRemainingSeconds(Math.max(0, MAX_DURATION_SECONDS - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTimeMs, showInstructions]);

  // Auto-focus input whenever a new AI question arrives
  useEffect(() => {
    if (!showInstructions && interviewId && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showInstructions, interviewId, messages.length])

  // Resolve candidateId once when session is available — uses JWT token or /api/candidate fallback
  useEffect(() => {
    if (!session?.user) return;

    // candidateId is embedded in the JWT token by auth-options — available immediately
    const fromToken = (session.user as { candidateId?: string }).candidateId;
    if (fromToken) {
      setCandidateId(fromToken);
      sessionStorage.setItem('candidateId', fromToken);

      return;
    }

    // Fallback: fetch from /api/candidate (covers cases where token was issued before we added candidateId)
    fetch('/api/candidate', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((cand) => {
        if (cand?.id) {
          setCandidateId(cand.id);
          sessionStorage.setItem('candidateId', cand.id);
        }
      })
      .catch(() => {});
  }, [session]);

  // Fetch anti-cheat settings (idle threshold) on mount — runs independently
  useEffect(() => {
    fetch('/api/settings/anti-cheat')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.idle_threshold_ms) setIdleThresholdMs(data.idle_threshold_ms)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep the latest message in view when the keyboard opens or the screen rotates
  useVisualViewportVars(() => {
    const list = messagesEndRef.current?.parentElement;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    // On the shortest screens the whole panel scrolls instead of the message list
    if (list.parentElement) list.parentElement.scrollTop = list.parentElement.scrollHeight;
  });

  // Intercept fetch to log all interview API calls (debug)
  useEffect(() => {
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const [url, options] = args;
      const urlStr = typeof url === 'string' ? url : (url as Request).url;
      if (urlStr.includes('/api/interview')) {
        console.log('[FetchIntercept]', options?.method || 'GET', urlStr);
      }
      return origFetch(...args);
    };
    return () => { window.fetch = origFetch; };
  }, []);

  // Check if interview is already completed on page load
  useEffect(() => {
    if (!candidateId) return;

    const checkInterviewStatus = async () => {
      // Check backend — API is the source of truth; only PASS sessions block entry
      console.log('[checkInterviewStatus] sessionStorage keys:', Object.keys(window.sessionStorage));
      console.log('[checkInterviewStatus] token in sessionStorage:', !!window.sessionStorage.getItem('candidate_session_token'), '| value:', window.sessionStorage.getItem('candidate_session_token')?.substring(0, 8));
      try {
        const response = await authFetch(`/api/interview/status/check?candidate_id=${candidateId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.has_completed_interview) {
            setIsInterviewCompleted(true);
            setShowInstructions(false);
          }
        }
      } catch (error) {
        console.error('Failed to check interview status:', error);
      }

      // Check if there's an existing active session (resume path)
      try {
        const queueRes = await authFetch(`/api/interview/queue/status/${candidateId}`);
        if (queueRes.ok) {
          const qData = await queueRes.json();
          // 6.4 — Show resume prompt if paused
          if (qData.result === 'paused') {
            setShowResumePrompt(true);
            return;
          }
        }
      } catch {
        // Non-fatal — proceed to interview page
      }
    };

    checkInterviewStatus();
  }, [router, candidateId]);

  // Block back button during active interview — show confirmation
  useEffect(() => {
    // Only activate when interview has started and is not complete
    if (!interviewId || isComplete) return;

    const handleBackButton = (e: PopStateEvent) => {
      e.preventDefault();
      setShowBackConfirmDialog(true);
      // Push state back so we're still on the page
      window.history.pushState(null, '', window.location.href);
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handleBackButton);
    return () => window.removeEventListener('popstate', handleBackButton);
  }, [interviewId, isComplete]);

  // 6.4 — Handle resume from a paused interview state
  const handleResumeInterview = async () => {
    setIsResuming(true);
    try {
      const res = await authFetch('/api/interview/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId }),
      });
      const data = await res.json();
      if (!res.ok || (data.result !== 'resumed' && data.result !== 'session_not_paused')) {
        setError(data.reason || 'Could not resume. Please try again.');
        setShowResumePrompt(false);
        return;
      }
      // Redirect to interview page — backend restores the snapshot
      router.push('/interview');
    } catch {
      setError('Network error. Please check your connection.');
      setShowResumePrompt(false);
    } finally {
      setIsResuming(false);
    }
  };

  const handleBeginInterview = async () => {
    setIsInterviewCompleted(false);
    setError(null);
    resetAntiCheat();
    setIsStarting(true);
    setShowStarting(true);
    setShowInstructions(false);

    // Resolve candidateId — try sessionStorage first (set by post-login),
    // then React state (from useEffect), then fall back to API call.
    let resolvedId =
      (typeof window !== 'undefined' ? sessionStorage.getItem('candidate_id') : null) ||
      candidateId ||
      '';
    if (!resolvedId) {
      try {
        const r = await fetch('/api/candidate', { credentials: 'include' });
        if (r.ok) {
          const cand = await r.json();
          resolvedId = cand?.id || '';
        }
      } catch { /* non-fatal */ }
    }

    if (!resolvedId) {
      setError('Candidate profile not found. Please complete onboarding first.');
      setShowStarting(false);
      setShowInstructions(true);
      setIsStarting(false);
      return;
    }

    try {
      // ── Step 1: Request an interview slot ─────────────────────────────────
      const queueRes = await authFetch('/api/interview/queue/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: resolvedId }),
      });
      const queueData = await queueRes.json();

      if (!queueRes.ok || !queueData || queueData.error) {
        setShowStarting(false);
        setShowInstructions(true);
        const errMsg = queueData?.error || queueData?.detail || queueData?.message || 'Failed to start interview. Please try again.';
        setError(errMsg);
        return;
      }

      if (queueData.result === 'no_slot') {
        setShowStarting(false);
        setShowInstructions(true);
        setError('All slots are full, please try after sometime.');
        return;
      }

      if (queueData.result === 'attempts_exhausted') {
        setShowStarting(false);
        setShowInstructions(true);
        setError('You have used all 3 available interview attempts. No further interviews can be started.');
        return;
      }

      if (queueData.result === 'cooldown') {
        setShowStarting(false);
        setShowInstructions(true);
        const until = queueData.cooldown_until
          ? new Date(queueData.cooldown_until).toLocaleString('en-IN')
          : 'the cooldown period';
        setError(`You are in cooldown until ${until}. Please try again after that.`);
        return;
      }

      if (queueData.result === 'already_active') {
        setInterviewId(queueData.interview_id);
        if (queueData.interview_id) {
          localStorage.setItem('currentInterview', JSON.stringify({
            interviewId: queueData.interview_id,
            startedAt: new Date().toISOString(),
          }));
        }
        setShowStarting(false);
        setShowInstructions(false);

        const restoredPhase = (queueData.phase || 'core') as 'core' | 'rapid_fire';
        const restoredLimit = queueData.time_limit_seconds || queueData.timeLimitSeconds || 120;
        const restoredQNum = queueData.question_number || queueData.questionNumber || 1;
        const restoredTotal = queueData.total_questions || queueData.totalQuestions || 25;
        const restoredOpts = queueData.options || null;
        const restoredTop = queueData.topic || 'agricultural_concepts';
        const restoredImg = queueData.image_url || queueData.imageUrl || null;

        setCurrentPhase(restoredPhase);
        setQuestionTimeLimit(restoredLimit);
        setQuestionTimeRemaining(restoredLimit);
        setCurrentQuestionNumber(restoredQNum);
        setTotalQuestions(restoredTotal);
        setCurrentOptions(restoredOpts);
        setCurrentImageUrl(restoredImg);
        setCurrentTopic(restoredTop);
        setSelectedOption(null);

        try {
          const histRes = await authFetch(`/api/interview/history/${queueData.interview_id}`);
          if (histRes.ok) {
            const histData = await histRes.json();
            if (histData.history?.length > 0) {
              const restored: Message[] = histData.history.map(
                (m: { role: string; content: string; phase?: string; options?: string[]; topic?: string; image_url?: string; imageUrl?: string }) => ({
                  role: (m.role === 'assistant' || m.role === 'ai') ? 'ai' : 'user',
                  content: m.content || 'Please provide your answer to this question.',
                  phase: (m.phase as any) || restoredPhase,
                  options: m.options || null,
                  topic: m.topic || restoredTop,
                  imageUrl: m.image_url || m.imageUrl || null,
                })
              );
              setMessages(restored);
              return;
            }
          }
        } catch { /* fallback below */ }

        const fallbackQ =
          queueData.first_question ||
          queueData.question ||
          'Hello, welcome to your interview assessment. Please describe your agricultural background and experience with soil and crop management.';
        setMessages([{
          role: 'ai',
          content: fallbackQ,
          phase: restoredPhase,
          options: restoredOpts,
          questionNumber: restoredQNum,
          totalQuestions: restoredTotal,
          topic: restoredTop,
          imageUrl: restoredImg,
        }]);
        return;
      }

      // ── Step 2: Slot acquired — start the interview ────────────────────────
      setShowStarting(false);
      setInterviewId(queueData.interview_id);
      localStorage.setItem('currentInterview', JSON.stringify({
        interviewId: queueData.interview_id,
        startedAt: new Date().toISOString(),
      }));
      const initialPhase = (queueData.phase || 'core') as 'core' | 'rapid_fire';
      const initialLimit = queueData.time_limit_seconds || queueData.timeLimitSeconds || 120;
      const initialQNum = queueData.question_number || queueData.questionNumber || 1;
      const initialTotal = queueData.total_questions || queueData.totalQuestions || 25;
      const initialOpts = queueData.options || null;
      const initialTop = queueData.topic || 'agricultural_concepts';
      const initialImg = queueData.image_url || queueData.imageUrl || null;

      setCurrentPhase(initialPhase);
      setQuestionTimeLimit(initialLimit);
      setQuestionTimeRemaining(initialLimit);
      setCurrentQuestionNumber(initialQNum);
      setTotalQuestions(initialTotal);
      setCurrentOptions(initialOpts);
      setCurrentImageUrl(initialImg);
      setCurrentTopic(initialTop);
      setSelectedOption(null);
      setRapidFireTimeoutsCount(0);

      const firstQuestionText =
        (queueData.first_question && queueData.first_question.trim()) ||
        (queueData.question && queueData.question.trim()) ||
        'Hello, welcome to your interview assessment. Please describe your agricultural background and experience with soil and crop management.';

      setMessages([{
        role: 'ai',
        content: firstQuestionText,
        phase: initialPhase,
        options: initialOpts,
        questionNumber: initialQNum,
        totalQuestions: initialTotal,
        topic: initialTop,
        imageUrl: initialImg,
      }]);
      setShowInstructions(false);
    } catch (error) {
      console.error('Failed to start interview:', error);
      setShowStarting(false);
      setShowInstructions(true);
      setError('Network error. Please ensure the backend server is running on port 8000.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleGoToSummary = () => {
    router.push('/summary');
  };

  // ── End interview helper (instant, no waiting) ────────────────────────
  // Calls /end and immediately shows the closing page.
  const endInterviewAndClose = async (effectiveInterviewId: string, endReason: string) => {
    // Clear stale evaluation/score data from previous attempts so summary never displays old scores
    localStorage.removeItem('interviewResult');
    localStorage.removeItem('interviewScore');
    localStorage.removeItem('interviewEvaluation');
    sessionStorage.removeItem('interviewResult');
    sessionStorage.removeItem('interviewScore');
    sessionStorage.removeItem('interviewEvaluation');

    // Notify backend
    try {
      await authFetch(`/api/interview/end/${effectiveInterviewId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ end_reason: endReason }),
      });
    } catch { /* non-fatal — backend will still process */ }

    // Mark completion flags so summary page knows to poll
    sessionStorage.setItem('interviewCompleted', 'true');
    localStorage.setItem('interviewCompleted', 'true');
    sessionStorage.setItem('interviewJustCompleted', 'true');
    localStorage.setItem('interviewJustCompleted', 'true');
    sessionStorage.setItem('interviewPhase', '3');
    localStorage.setItem('interviewPhase', '3');
    sessionStorage.setItem('closingInterviewId', effectiveInterviewId);
    localStorage.setItem('closingInterviewId', effectiveInterviewId);

    // DB phase sync is now handled directly by the backend endpoint in route.py

    // Show the closing page immediately
    setClosingInterviewId(effectiveInterviewId);
    setShowClosingPage(true);
  };

  const handleSubmit = async (e?: React.FormEvent, overrideAnswer?: string) => {
    // Prevent double submission
    if (isSubmittingRef.current || isLoading) {
      return;
    }
    
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    
    const userMessage = (overrideAnswer !== undefined ? overrideAnswer : input).trim();
    if (!userMessage) {
      return;
    }
    
    let effectiveInterviewId = interviewId;
    if (!effectiveInterviewId) {
      try {
        const stored = localStorage.getItem('currentInterview');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.interviewId) {
            effectiveInterviewId = parsed.interviewId;
            setInterviewId(parsed.interviewId);
          }
        }
      } catch {}
    }

    if (!effectiveInterviewId) {
      console.error('Interview not started - no active interview session found');
      setError('Interview session not active. Please refresh the page to restart or resume.');
      return;
    }

    isSubmittingRef.current = true;
    
    setSelectedOption(null);
    setInput('');
    setIsLoading(true);
    setShowEvaluation(false);

    // Add user message immediately
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await authFetch('/api/interview/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId: effectiveInterviewId,
          interview_id: effectiveInterviewId,
          message: userMessage
        }),
      });

      const data = await response.json();

      // Check if there's an error in the response
      if (!response.ok || data.error) {
        const errorMessage = data.error || 'Failed to send message. Please try again.';
        console.error('API Error:', errorMessage);
        setError(errorMessage);
        // Clear the user message and show error
        setInput(userMessage);
        setMessages(prev => prev.filter((_, i) => i !== prev.length - 1));
        return;
      }

      setError(null); // Clear any previous errors

      // Update conversation history with latest evaluations
      if (data.evaluation) {
        setConversationHistory(prev => [
          ...prev,
          {
            question: messages[messages.length - 1]?.content || '',
            answer: userMessage,
            evaluation: data.evaluation
          }
        ]);
        setCurrentEvaluation(data.cumulative_evaluation);
      }

      if (data.is_complete) {
        setIsComplete(true);

        // End interview — fire-and-forget, /end returns instantly now
        const endReason = data.end_reason || 'time_limit';
        if (interviewId) {
          await endInterviewAndClose(interviewId, endReason);
        }

        // Save conversation history for summary page
        localStorage.setItem('interviewConversationHistory', JSON.stringify([
          ...conversationHistory,
          { question: messages[messages.length - 1]?.content || '', answer: userMessage }
        ]));

        setMessages(prev => [...prev, { role: 'ai', content: data.response }]);
        setShowEvaluation(true);

        // Clear stale cached results before navigating to summary
        localStorage.removeItem('interviewResult');
        localStorage.removeItem('interviewScore');
        localStorage.removeItem('interviewEvaluation');
        sessionStorage.removeItem('interviewResult');
        sessionStorage.removeItem('interviewScore');
        sessionStorage.removeItem('interviewEvaluation');
        if (effectiveInterviewId) {
          sessionStorage.setItem('closingInterviewId', effectiveInterviewId);
          localStorage.setItem('closingInterviewId', effectiveInterviewId);
        }
        sessionStorage.setItem('interviewJustCompleted', 'true');
        localStorage.setItem('interviewJustCompleted', 'true');

        setTimeout(() => { router.push('/summary'); }, 20000);
      } else {
        const nextPhase = (data.phase || 'core') as 'core' | 'rapid_fire';
        const nextLimit = data.time_limit_seconds || data.timeLimitSeconds || (nextPhase === 'core' ? 120 : 30);
        const nextQNum = data.question_number || data.questionNumber || (currentQuestionNumber + 1);
        const nextTotal = data.total_questions || data.totalQuestions || 25;
        const nextOpts = data.options || null;
        const nextTop = data.topic || null;
        const nextImg = data.image_url || data.imageUrl || null;

        setCurrentPhase(nextPhase);
        setQuestionTimeLimit(nextLimit);
        setQuestionTimeRemaining(nextLimit);
        setCurrentQuestionNumber(nextQNum);
        setTotalQuestions(nextTotal);
        setCurrentOptions(nextOpts);
        setCurrentImageUrl(nextImg);
        setCurrentTopic(nextTop);
        setSelectedOption(null);

        setMessages(prev => [...prev, { 
          phase: nextPhase,
          options: nextOpts,
          questionNumber: nextQNum,
          totalQuestions: nextTotal,
          topic: nextTop,
          imageUrl: nextImg,
          role: 'ai', 
          content: data.response,
          evaluation: data.evaluation
        }]);
        // Show brief evaluation after each answer
        if (data.evaluation) {
          setShowEvaluation(true);
          setTimeout(() => setShowEvaluation(false), 5000);
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Save interview state before signalling disconnect so candidate can resume
      if (interviewId && candidateId) {
        authFetch('/api/interview/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidateId, interview_id: interviewId }),
        }).catch(() => {})
      }
      setIsReconnecting(true)
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleQuestionTimeout = useCallback(() => {
    if (isSubmittingRef.current || isLoading || isComplete) return;
    if (hasTimedOutRef.current) return;
    hasTimedOutRef.current = true;

    const phase = latestPhaseRef.current;
    const opt = latestSelectedOptionRef.current;
    const currInput = latestInputRef.current;

    if (phase === 'rapid_fire') {
      if (opt) {
        handleSubmit(undefined, opt);
      } else {
        const newTimeouts = rapidFireTimeoutsCount + 1;
        setRapidFireTimeoutsCount(newTimeouts);

        // Anti-cheating trigger: If a candidate allows 5 rapid-fire questions to expire without choosing an answer, record warning
        if (newTimeouts === 5) {
          recordViolation('rapid_fire_timeout', {
            message: 'Candidate allowed 5 rapid-fire questions to expire without choosing an answer.',
            metadata: { timeoutsCount: newTimeouts },
          });
        }

        handleSubmit(undefined, '[Time expired - No answer selected]');
      }
    } else {
      if (currInput && currInput.trim()) {
        handleSubmit(undefined, currInput.trim());
      } else {
        handleSubmit(undefined, '[Time expired - No answer provided]');
      }
    }
  }, [rapidFireTimeoutsCount, recordViolation, isLoading, isComplete]);

  const handleQuestionTimeoutRef = useRef(handleQuestionTimeout);
  handleQuestionTimeoutRef.current = handleQuestionTimeout;

  // Reset question timer start timestamp when question advances or starts
  useEffect(() => {
    questionStartMsRef.current = Date.now();
    hasTimedOutRef.current = false;
    setQuestionTimeRemaining(questionTimeLimit);
  }, [currentQuestionNumber, currentPhase, questionTimeLimit]);

  // Per-question visible countdown timer (120s for core, 30s for rapid-fire)
  useEffect(() => {
    if (showInstructions || isComplete || isInterviewCompleted || showClosingPage || isLoading) {
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - questionStartMsRef.current) / 1000);
      const remaining = Math.max(0, questionTimeLimitRef.current - elapsed);
      setQuestionTimeRemaining(remaining);

      if (remaining <= 0 && !hasTimedOutRef.current) {
        handleQuestionTimeoutRef.current();
      }
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [showInstructions, isComplete, isInterviewCompleted, showClosingPage, isLoading, currentQuestionNumber]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    return '#ef4444';
  };

  const handleEndInterview = async () => {
    // Resolve effective interview ID from state or localStorage
    let effectiveInterviewId = interviewId;
    if (!effectiveInterviewId) {
      try {
        const stored = localStorage.getItem('currentInterview');
        if (stored) {
          effectiveInterviewId = JSON.parse(stored).interviewId;
        }
      } catch { /* ignore */ }
    }
    if (!effectiveInterviewId) {
      setError('Interview not started. Please refresh the page.');
      return;
    }
    await endInterviewAndClose(effectiveInterviewId, 'withdrawn');
  };

  const handleConfirmBack = async () => {
    setShowBackConfirmDialog(false);

    // Notify backend — fire-and-forget, non-blocking
    authFetch('/api/interview/queue/cancel', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId }),
    }).catch(() => {});

    // Resolve effective interview ID
    let effectiveInterviewId = interviewId;
    if (!effectiveInterviewId) {
      try {
        const stored = localStorage.getItem('currentInterview');
        if (stored) {
          effectiveInterviewId = JSON.parse(stored).interviewId;
        }
      } catch { /* ignore */ }
    }
    if (effectiveInterviewId) {
      await endInterviewAndClose(effectiveInterviewId, 'withdrawn');
    }
  };

  const handleConfirmEnd = async () => {
    setShowEndConfirmDialog(false);

    // Notify backend — fire-and-forget, non-blocking
    authFetch('/api/interview/queue/cancel', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId }),
    }).catch(() => {});

    // Resolve effective interview ID
    let effectiveInterviewId = interviewId;
    if (!effectiveInterviewId) {
      try {
        const stored = localStorage.getItem('currentInterview');
        if (stored) {
          effectiveInterviewId = JSON.parse(stored).interviewId;
        }
      } catch { /* ignore */ }
    }
    if (effectiveInterviewId) {
      await endInterviewAndClose(effectiveInterviewId, 'withdrawn');
    }
  };

  const handleCancelEnd = () => {
    setShowEndConfirmDialog(false);
  };

  // Show completed screen if interview is done
  if (isInterviewCompleted) {
    return (
      <div className={styles.container}>
        <div className={styles.completedScreen}>
          <div className={styles.completedCard}>
            <div className={styles.completedIcon}>✓</div>
            <h1 className={styles.completedTitle}>Interview Completed</h1>
            <p className={styles.completedSubtitle}>
              You have already completed your interview session.
            </p>
            <p className={styles.completedDescription}>
              Your responses have been recorded and evaluated. 
              Click below to view your interview summary and results.
            </p>
            <button 
              className={styles.completedButton}
              onClick={handleGoToSummary}
            >
              View Interview Summary
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6.4 — Show resume prompt if interview was paused (interruption path)
  // 6.5 — Show "Starting your interview soon" screen
  if (showStarting) {
    return (
      <div className={styles.container}>
        <div className={styles.completedScreen}>
          <div className={styles.completedCard}>
            <div className={styles.startingIcon}>🚀</div>
            <h1 className={styles.completedTitle}>Starting your interview soon</h1>
            <p className={styles.completedSubtitle}>
              A slot is available. Setting everything up for you — this will only take a moment.
            </p>
            <div className={styles.startingDots}>
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showResumePrompt) {
    return (
      <div className={styles.container}>
        <div className={styles.completedScreen}>
          <div className={styles.completedCard}>
            <div className={styles.completedIcon}>⏸</div>
            <h1 className={styles.completedTitle}>Interview Paused</h1>
            <p className={styles.completedSubtitle}>
              Your interview was interrupted but your progress has been saved.
            </p>
            <p className={styles.completedDescription}>
              Your interview will resume from where you left off — no need to start over.
            </p>
            {error && <p className={styles.errorText}>{error}</p>}
            <button
              className={styles.completedButton}
              onClick={handleResumeInterview}
              disabled={isResuming}
            >
              {isResuming ? 'Resuming…' : 'Resume Interview'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showInstructions ? (
        <div className={styles.instructionScreen}>
          <CandidateNavbar />
          <div className={styles.instructionBody}>
          <div className={styles.instructionCard}>
            <h1 className={styles.instructionTitle}>Interview Guidelines</h1>
            <p className={styles.instructionSubtitle}>Please read the following guidelines carefully before starting your interview</p>

            <div className={styles.guidelines}>
              <ul>
                <li><strong>Part 1: 13 Core Questions</strong> — 1 greeting question followed by 12 technical questions (2 minutes per question).</li>
                <li><strong>Part 2: 12 Rapid-Fire Questions</strong> — Four-option multiple-choice questions (30 seconds per question).</li>
                <li><strong>Auto-Advance Timers</strong> — Visible countdown timers automatically advance to the next question when time expires.</li>
              </ul>

              <h3 className={styles.antiCheatTitle}>⚠️ Anti-Cheating Rules</h3>
              <p className={styles.antiCheatSubtitle}>The following actions are monitored and will result in interview termination after 5 violations:</p>
              <ul className={styles.antiCheatList}>
                <li>🚫 <strong>Tab Switching</strong> — Do not switch to other browser tabs or windows</li>
                <li>🚫 <strong>Leaving the Window</strong> — Do not click outside or Alt+Tab away from this window</li>
                <li>🚫 <strong>Exiting Fullscreen</strong> — The interview runs in fullscreen mode; do not exit it</li>
                <li>🚫 <strong>Copy / Paste</strong> — Copy and paste are disabled during the interview</li>
                <li>🚫 <strong>Right-Click</strong> — Right-click context menu is disabled</li>
                <li>🚫 <strong>Text Selection</strong> — Selecting text on the page is not allowed</li>
                <li>🚫 <strong>Multi-Monitor</strong> — Moving the browser to another display is not allowed</li>
                <li>🚫 <strong>Idle Timeout</strong> — If no activity is detected for 10 seconds, a warning will be triggered</li>
                <li>🚫 <strong>Unusual Text Replacement</strong> — Typing filler text and rapidly deleting large amounts to replace it may trigger a warning</li>
                <li>🚫 <strong>Rapid-Fire Timeouts</strong> — Allowing 5 rapid-fire questions to expire without choosing an answer records an anti-cheat warning</li>
              </ul>
              <p className={styles.antiCheatNote}>
                🔒 All violations are logged and reported to the review team. Please stay focused throughout the interview.
              </p>
            </div>

            <button
              className={styles.beginButton}
              onClick={handleBeginInterview}
              disabled={isStarting}
            >
              {isStarting ? 'Starting...' : 'Begin Interview'}
            </button>

            {error && <p className={styles.errorMessage}>{error}</p>}
          </div>
          </div>
        </div>
      ) : (
        <div className={styles.container}>
          <div className={styles.chatContainer}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <h1 className={styles.title}>AI Interview Assistant</h1>
              {currentEvaluation && (
                <div className={styles.stats}>
                  <span className={styles.stat}>Q{currentEvaluation.total_questions}</span>
                  <span className={styles.stat} style={{ color: getScoreColor(currentEvaluation.average_score) }}>
                    Avg: {currentEvaluation.average_score.toFixed(0)}%
                  </span>
                  <span className={styles.stat}>{currentEvaluation.performance_trend}</span>
                  <span className={styles.difficulty}>{currentEvaluation.difficulty_level}</span>
                </div>
              )}
            </div>
            {!isComplete && (
              <button 
                className={styles.endButton}
                onClick={() => setShowEndConfirmDialog(true)}
                disabled={isEnding}
              >
                End Interview
              </button>
            )}
          </div>

          {error && (
            <div className={styles.errorMessage}>
              {error}
              {error.includes('already completed') ? (
                <button onClick={handleGoToSummary} className={styles.goToSummaryButton}>
                  Go to Interview Summary
                </button>
              ) : null}
              <button onClick={() => setError(null)} className={styles.dismissError}>
                ×
              </button>
            </div>
          )}

          {isEnding && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingContent}>
                <div className={styles.spinner}></div>
                <h2>Finishing the interview...</h2>
                <p>Please wait while we save your responses and generate your evaluation.</p>
              </div>
            </div>
          )}

          {showEndConfirmDialog && (
            <div className={styles.confirmOverlay}>
              <div className={styles.confirmDialog}>
                <h2>End Interview?</h2>
                <p>Are you sure you want to end the Interview?</p>
                <div className={styles.confirmButtons}>
                  <button 
                    className={styles.confirmYesButton}
                    onClick={handleConfirmEnd}
                  >
                    Yes
                  </button>
                  <button 
                    className={styles.confirmNoButton}
                    onClick={handleCancelEnd}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>
          )}

          {showBackConfirmDialog && (
            <div className={styles.confirmOverlay}>
              <div className={styles.confirmDialog}>
                <h2>Leave Interview?</h2>
                <p>Going back will close your interview. Your progress will be lost and you won't be able to resume.</p>
                <div className={styles.confirmButtons}>
                  <button
                    className={styles.confirmYesButton}
                    onClick={handleConfirmBack}
                  >
                    Leave
                  </button>
                  <button
                    className={styles.confirmNoButton}
                    onClick={() => setShowBackConfirmDialog(false)}
                  >
                    Stay
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live time-remaining badge */}
          {timeRemainingSeconds >= 0 && !showInstructions && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '4px 16px 0',
              fontSize: '13px',
              color: timeRemainingSeconds < 60 ? '#dc2626' : '#6b7280',
              fontFamily: 'monospace',
            }}>
              ⏱ {Math.floor(timeRemainingSeconds / 60)}:{String(timeRemainingSeconds % 60).padStart(2, '0')} remaining
            </div>
          )}

          {/* Structured Assessment Question Header & Timer Banner */}
          {!showInstructions && !isComplete && (
            <>
              <div className={styles.questionHeaderBar}>
                <div className={styles.questionMeta}>
                  <span className={currentPhase === 'core' ? styles.phaseBadgeCore : styles.phaseBadgeRapid}>
                    {currentPhase === 'core' ? 'Part 1: Core Question' : 'Part 2: Rapid-Fire MCQ'}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                    Question {currentQuestionNumber} of {totalQuestions}
                  </span>
                </div>
                <div className={styles.questionTimerContainer}>
                  <div className={`${styles.questionTimerBadge} ${
                    questionTimeRemaining / questionTimeLimit > 0.4
                      ? styles.timerGreen
                      : questionTimeRemaining / questionTimeLimit > 0.15
                      ? styles.timerYellow
                      : styles.timerRed
                  }`}>
                    <span>⏱</span>
                    <span>
                      {Math.floor(questionTimeRemaining / 60)}:
                      {String(questionTimeRemaining % 60).padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.timerProgressBar}>
                <div
                  className={styles.timerProgressFill}
                  style={{
                    width: `${Math.max(0, Math.min(100, (questionTimeRemaining / questionTimeLimit) * 100))}%`,
                    backgroundColor:
                      questionTimeRemaining / questionTimeLimit > 0.4
                        ? '#16a34a'
                        : questionTimeRemaining / questionTimeLimit > 0.15
                        ? '#ca8a04'
                        : '#dc2626',
                  }}
                />
              </div>
            </>
          )}

          <div className={styles.messages}>
            {messages.map((message, index) => {
              const roleClass = message.role === 'user' ? styles.user : styles.ai;
              const contentText = (message.content && message.content.trim())
                ? message.content
                : (message.role === 'user' ? '(No response provided)' : 'Hello, welcome to your interview assessment. Please describe your agricultural background and practical experience.');

              return (
                <div key={index} className={`${styles.message} ${roleClass}`}>
                  {message.imageUrl && (
                    <div className={styles.questionImageWrapper}>
                      <img src={message.imageUrl} alt="Visual Identification Specimen" className={styles.questionImage} />
                    </div>
                  )}
                  <div className={styles.messageContent}>{contentText}</div>
                {message.evaluation && (
                  <div className={styles.evaluationCard}>
                    <div className={styles.score} style={{ color: getScoreColor(message.evaluation.score) }}>
                      Score: {message.evaluation.score}/100
                    </div>
                    <div className={styles.feedback}>
                      <strong>Feedback:</strong> {message.evaluation.feedback}
                    </div>
                    {message.evaluation.strengths.length > 0 && (
                      <div className={styles.strengths}>
                        <strong>Strengths:</strong>
                        <ul>
                          {message.evaluation.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {message.evaluation.weaknesses.length > 0 && (
                      <div className={styles.weaknesses}>
                        <strong>Areas to Improve:</strong>
                        <ul>
                          {message.evaluation.weaknesses.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
            {isLoading && (
              <div className={`${styles.message} ${styles.ai}`}>
                <div className={styles.messageContent}>Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {currentEvaluation && !isComplete && (
            <div className={styles.quickStats}>
              <div className={styles.quickStatItem}>
                <span className={styles.quickStatLabel}>Running Score</span>
                <span className={styles.quickStatValue} style={{ color: getScoreColor(currentEvaluation.average_score) }}>
                  {currentEvaluation.average_score.toFixed(0)}%
                </span>
              </div>
              <div className={styles.quickStatItem}>
                <span className={styles.quickStatLabel}>Trend</span>
                <span className={styles.quickStatValue}>{currentEvaluation.performance_trend}</span>
              </div>
            </div>
          )}

          {isComplete && conversationHistory.length > 0 && (
            <div className={styles.finalEvaluation}>
              <h2>Interview Complete</h2>
              <div className={styles.finalScore}>
                Overall Score: {currentEvaluation?.average_score.toFixed(0) || 0}%
              </div>
              <div className={styles.historySummary}>
                <h3>Conversation Summary</h3>
                {conversationHistory.map((item, index) => (
                  <div key={index} className={styles.historyItem}>
                    <div className={styles.historyQ}>Q{index + 1}: {item.question}</div>
                    <div className={styles.historyA}>A: {item.answer.substring(0, 100)}...</div>
                    {item.evaluation && (
                      <div className={styles.historyEval}>
                        Score: {item.evaluation.score}/100 - {item.evaluation.feedback}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isComplete && currentPhase === 'rapid_fire' && currentOptions && currentOptions.length === 4 ? (
            <div className={styles.rapidFireContainer}>
              <div className={styles.rapidFireHint}>
                <span>⚡ Rapid-Fire MCQ: Select ONE option (30s limit)</span>
                {rapidFireTimeoutsCount > 0 && (
                  <span className={styles.timeoutWarningBadge}>
                    ⚠️ Unanswered timeouts: {rapidFireTimeoutsCount}/5
                  </span>
                )}
              </div>
              {(() => {
                const latestQ = [...messages].reverse().find(m => m.role === 'ai')?.content;
                return latestQ ? (
                  <div className={styles.rapidFireQuestionBox}>
                    <p className={styles.rapidFireQuestionText}>{latestQ}</p>
                  </div>
                ) : null;
              })()}
              {currentImageUrl && (
                <div className={styles.rapidFireImageWrapper}>
                  <img src={currentImageUrl} alt="Visual Identification Specimen" className={styles.rapidFireImage} />
                </div>
              )}
              <div className={styles.optionsGrid}>
                {currentOptions.map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  const displayText = opt.startsWith(`${letter})`) || opt.startsWith(`${letter}.`) 
                    ? opt.substring(2).trim() 
                    : opt;
                  const isSelected = selectedOption === opt;

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ''}`}
                      onClick={() => setSelectedOption(opt)}
                      disabled={isLoading}
                    >
                      <span className={`${styles.optionLetter} ${isSelected ? styles.optionLetterSelected : ''}`}>
                        {letter}
                      </span>
                      <span className={styles.optionText}>{displayText}</span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.rapidFireActions}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  {selectedOption ? `Selected: Option ${selectedOption.substring(0, 1)}` : 'Click an option to select'}
                </span>
                <button
                  type="button"
                  className={styles.rapidFireSubmitBtn}
                  disabled={!selectedOption || isLoading}
                  onClick={() => {
                    if (selectedOption) {
                      handleSubmit(undefined, selectedOption);
                    }
                  }}
                >
                  {isLoading ? 'Submitting...' : 'Submit Answer'}
                </button>
              </div>
            </div>
          ) : !isComplete && (
            <form onSubmit={handleSubmit} className={styles.inputForm}>
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  // Shift+Enter / Ctrl+Enter insert a new line at the caret instead of sending
                  if (e.shiftKey || e.ctrlKey) {
                    const el = e.currentTarget;
                    const { selectionStart, selectionEnd } = el;
                    setInput(input.slice(0, selectionStart) + '\n' + input.slice(selectionEnd));
                    requestAnimationFrame(() => el.setSelectionRange(selectionStart + 1, selectionStart + 1));
                    return;
                  }
                  if (input.trim() && !isLoading) {
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Type your answer here..."
                className={styles.input}
                disabled={isLoading}
              />
              <button type="submit" className={styles.button} disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
          )}
        </div>
        </div>
      )}
      <AntiCheatOverlay
        isVisible={cheatWarning.visible}
        violationType={cheatWarning.type}
        offenseCount={cheatWarning.count}
        onDismiss={() => setCheatWarning(v => ({ ...v, visible: false }))}
      />
      {/* Closing page — shown immediately after interview ends */}
      {showClosingPage && (
        <div className={styles.closingPageWrapper}>
          <div className={styles.closingPageCard}>
            <div className={styles.closingPageIcon}>✓</div>
            <h1 className={styles.closingPageTitle}>Interview is Done!</h1>
            <p className={styles.closingPageSubtitle}>
              Your interview has been submitted successfully.
            </p>
            <p className={styles.closingPageDesc}>
              Please visit the summary page to see your results.<br/>
              Results will be available once the evaluation is complete.
            </p>
            <div className={styles.closingPageButtons}>
              <button
                className={styles.closingPageSummaryBtn}
                onClick={() => router.push('/summary')}
              >
                View Summary
              </button>
              <button
                className={styles.closingPageDashboardBtn}
                onClick={() => router.push('/dashboard')}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
      {isReconnecting && (
        <div className={styles.closingOverlay}>
          <div className={styles.closingContent}>
            <div className={styles.closingSpinner} />
            <h2>Connection lost — saving your progress</h2>
            <p>Your interview has been paused and saved. Return to the dashboard to resume.</p>
          </div>
        </div>
      )}
      {isClosing && (
        <div className={styles.closingOverlay}>
          <div className={styles.closingContent}>
            <div className={styles.closingSpinner} />
            <h2>Closing the interview...</h2>
            <p>Please wait.</p>
          </div>
        </div>
      )}
    </>
  );
}
