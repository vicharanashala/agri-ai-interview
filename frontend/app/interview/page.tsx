'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';
import { useAntiCheat, type ViolationType } from '@/hooks/useAntiCheat';
import { interceptAuthFetch, authFetch } from '@/lib/auth-fetch';
import AntiCheatOverlay from '@/components/AntiCheatOverlay';

interface Message {
  role: 'ai' | 'user';
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
  const [candidateId, setCandidateId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);

  // Anti-cheat: warning callback
  const handleCheatViolation = useCallback((type: ViolationType, count: number) => {
    setCheatWarning({ visible: true, type, count })
  }, [])

  // Anti-cheat: termination callback
  const handleCheatTerminate = useCallback(async (type: ViolationType) => {
    setCheatWarning(v => ({ ...v, visible: false }))
    setIsClosing(true)
    // Show closing screen for 2 seconds before ending
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (interviewId) {
      await authFetch(`/api/interview/end/${interviewId}`, { method: 'POST' })
    }
    sessionStorage.setItem('interviewTerminatedCheat', 'true')
    sessionStorage.setItem('interviewPhase', '3')
    localStorage.setItem('interviewPhase', '3')
    await syncPhaseToDb(3)
    router.push('/summary?terminated=true')
  }, [interviewId, router])

  // Anti-cheat: log violation to backend (fire-and-forget)
  const handleCheatLog = useCallback((type: ViolationType) => {
    fetch('/api/anti-cheat/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId,
        interviewId: interviewId || null,
        eventType: type,
        severity: 'warning',
        message: null,
        metadata: null,
      }),
    }).catch(() => {})  // silently ignore errors — don't affect interview
  }, [interviewId])

  const { reset: resetAntiCheat } = useAntiCheat({
    onViolation: handleCheatViolation,
    onTerminate: handleCheatTerminate,
    onLogEvent: handleCheatLog,
    enabled: !showInstructions && !isComplete,
  })

  // Auto-attach Authorization: Bearer token to ALL fetch calls on this page
  useEffect(() => {
    const restore = interceptAuthFetch()
    return restore
  }, [])

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // First check localStorage
      const wasCompleted = localStorage.getItem('interviewCompleted') === 'true' || 
                           sessionStorage.getItem('interviewCompleted') === 'true';
      
      if (wasCompleted) {
        setIsInterviewCompleted(true);
        setShowInstructions(false);
        return;
      }

      // Then check backend — pass candidateId so we check THIS candidate's session, not all sessions
      try {
        const response = await authFetch(`/api/interview/status/check?candidate_id=${candidateId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.has_completed_interview) {
            setIsInterviewCompleted(true);
            setShowInstructions(false);
            // Also set localStorage for future visits
            localStorage.setItem('interviewCompleted', 'true');
            sessionStorage.setItem('interviewCompleted', 'true');
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

      if (queueData.result === 'no_slot') {
        setShowStarting(false);
        setShowInstructions(true);
        setError('All slots are full, please try after sometime.');
        return;
      }

      if (queueData.result === 'already_active') {
        setInterviewId(queueData.interview_id);
        setShowStarting(false);
        setShowInstructions(false);
        try {
          const histRes = await authFetch(`/api/interview/history/${queueData.interview_id}`);
          if (histRes.ok) {
            const histData = await histRes.json();
            if (histData.history?.length > 0) {
              const restored: Message[] = histData.history.map(
                (m: { role: string; content: string }) => ({
                  role: m.role as 'ai' | 'user',
                  content: m.content,
                })
              );
              setMessages(restored);
            } else {
              setMessages([{ role: 'ai', content: 'Welcome back! Please continue from where you left off.' }]);
            }
          }
        } catch {
          setMessages([{ role: 'ai', content: 'Welcome back! Please continue from where you left off.' }]);
        }
        return;
      }

      // ── Step 2: Slot acquired — start the interview ────────────────────────
      setInterviewId(queueData.interview_id);
      localStorage.setItem('currentInterview', JSON.stringify({
        interviewId: queueData.interview_id,
        startedAt: new Date().toISOString(),
      }));
      setMessages([{ role: 'ai', content: queueData.first_question }]);
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

  const handleSubmit = async (e?: React.FormEvent) => {
    // Prevent double submission
    if (isSubmittingRef.current || isLoading) {
      return;
    }
    
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    
    if (!input.trim()) {
      return;
    }
    
    if (!interviewId) {
      console.error('Interview not started');
      return;
    }

    isSubmittingRef.current = true;
    
    const userMessage = input;
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
          interviewId: interviewId,
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
        
        // Mark interview as completed and set phase
        sessionStorage.setItem('interviewCompleted', 'true');
        localStorage.setItem('interviewCompleted', 'true');
        sessionStorage.setItem('interviewJustCompleted', 'true');
        localStorage.setItem('interviewJustCompleted', 'true');
        sessionStorage.setItem('interviewPhase', '3');
        localStorage.setItem('interviewPhase', '3');
        await syncPhaseToDb(3);

        // Call backend to end interview — this updates InterviewSession.status to 'completed' in DB
        if (interviewId) {
          await authFetch(`/api/interview/end/${interviewId}`, { method: 'POST' });
        }

        // Save conversation history for summary page
        const evaluationData = {
          average_score: data.cumulative_evaluation?.average_score || 0,
          total_questions: data.cumulative_evaluation?.total_questions || conversationHistory.length + 1,
          messages: [...messages, { role: 'ai', content: data.response }],
          conversationHistory: [...conversationHistory, {
            question: messages[messages.length - 1]?.content || '',
            answer: userMessage,
            evaluation: data.evaluation
          }]
        };
        sessionStorage.setItem('interviewEvaluation', JSON.stringify(evaluationData));

        // Also store in localStorage for cross-page access
        localStorage.setItem('interviewConversationHistory', JSON.stringify([
          ...conversationHistory,
          { question: messages[messages.length - 1]?.content || '', answer: userMessage }
        ]));
        
        setMessages(prev => [...prev, { 
          role: 'ai', 
          content: data.response,
          evaluation: data.evaluation
        }]);
        setShowEvaluation(true);

        // Fetch real evaluation and redirect to summary
        const history = messages
          .filter((m: any) => m.role === 'user' || m.role === 'ai')
          .map((m: any) => ({ role: m.role, content: m.content }));
        const evalRes = await authFetch('/api/interview/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interview_id: interviewId, conversation_history: history, candidate_data: {} }),
        });
        if (evalRes.ok) {
          const evalData = await evalRes.json();
          localStorage.setItem('interviewEvaluation', JSON.stringify(evalData));
        }
        setTimeout(() => { router.push('/summary'); }, 2000);
      } else {
        setMessages(prev => [...prev, { 
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
      const errorMessage = 'Network error. Please check your connection and try again.';
      setError(errorMessage);
      // Clear the input and show error to user
      setInput(userMessage);
      setMessages(prev => prev.filter((_, i) => i !== prev.length - 1));
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    return '#ef4444';
  };

  const handleEndInterview = async () => {
    console.log('[EndInterview] handleEndInterview called, interviewId=', interviewId);

    // Fix #1: Fall back to localStorage if interviewId state is null
    let effectiveInterviewId = interviewId;
    if (!effectiveInterviewId) {
      try {
        const stored = localStorage.getItem('currentInterview');
        if (stored) {
          effectiveInterviewId = JSON.parse(stored).interviewId;
          console.log('[EndInterview] Recovered interviewId from localStorage:', effectiveInterviewId);
        }
      } catch (e) {
        console.error('[EndInterview] Failed to parse stored interviewId:', e);
      }
    }

    if (!effectiveInterviewId) {
      console.error('[EndInterview] Interview not started — interviewId is null');
      setError('Interview not started. Please refresh the page.');
      return;
    }

    setIsEnding(true);
    setError(null);

    try {
      // End the interview session
      const endRes = await authFetch(`/api/interview/end/${effectiveInterviewId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const endData = await endRes.json();

      // Fix #2: Check HTTP status directly — FastAPI returns "detail" not "error"
      if (!endRes.ok) {
        const errorMessage = endData.detail || 'Failed to end interview. Please try again.';
        console.error('End interview error:', errorMessage);
        setError(errorMessage);
        setIsEnding(false);
        return;
      }

      // Build conversation history from messages state (strip extra fields)
      const history = messages
        .filter((m: any) => m.role === 'user' || m.role === 'ai')
        .map((m: any) => ({ role: m.role, content: m.content }));

      // Immediately fetch evaluation and cache it
      const evalRes = await authFetch('/api/interview/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: effectiveInterviewId,
          conversation_history: history,
          candidate_data: {},
        }),
      });

      if (evalRes.ok) {
        const evalData = await evalRes.json();
        localStorage.setItem('interviewEvaluation', JSON.stringify(evalData));
      }

      // Redirect to summary page
      router.push('/summary');
    } catch (error) {
      console.error('Failed to end interview:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsEnding(false);
    }
  };

  const handleConfirmBack = async () => {
    setShowBackConfirmDialog(false);
    setIsEnding(true);

    try {
      // Use localStorage fallback for interviewId (same as handleEndInterview)
      let effectiveInterviewId = interviewId;
      if (!effectiveInterviewId) {
        try {
          const stored = localStorage.getItem('currentInterview');
          if (stored) {
            effectiveInterviewId = JSON.parse(stored).interviewId;
          }
        } catch (e) {}
      }

      if (effectiveInterviewId) {
        await authFetch(`/api/interview/end/${effectiveInterviewId}`, { method: 'POST' });
      }

      authFetch('/api/interview/queue/cancel', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId }),
      }).catch(() => {});

      sessionStorage.setItem('interviewPhase', '3');
      localStorage.setItem('interviewPhase', '3');
      sessionStorage.setItem('phase2_completed', 'true');
      localStorage.setItem('phase2_completed', 'true');
      await syncPhaseToDb(3);

      router.push('/summary?terminated=true');
    } catch (error) {
      console.error('Failed to end interview on back:', error);
      setIsEnding(false);
    }
  };

  const handleConfirmEnd = async () => {
    // Close dialog immediately so user sees it go away
    setShowEndConfirmDialog(false);

    // 6.6 — Notify backend of voluntary cancel before ending
    authFetch('/api/interview/queue/cancel', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId }),
    }).catch(() => {}); // non-fatal — don't block the end flow

    // Set Interview Summary (Phase 3) as current phase
    sessionStorage.setItem('interviewPhase', '3');
    localStorage.setItem('interviewPhase', '3');

    // Mark Start Interview (Phase 2) as completed
    sessionStorage.setItem('phase2_completed', 'true');
    localStorage.setItem('phase2_completed', 'true');

    // Sync to DB so admin dashboard sees the correct phase
    await syncPhaseToDb(3);

    console.log('[EndInterview] handleConfirmEnd: calling handleEndInterview, interviewId=', interviewId);
    // Call the end interview API
    await handleEndInterview();
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
          <div className={styles.instructionCard}>
            <h1 className={styles.instructionTitle}>Interview Guidelines</h1>
            <p className={styles.instructionSubtitle}>Please read the following guidelines carefully before starting your interview</p>

            <div className={styles.guidelines}>
              <ul>
                <li>This is an AI powered chat interview.</li>
                <li>The interview will adapt based on your responses and evaluate accordingly.</li>
                <li>Try to answer the questions in depth to get better results.</li>
              </ul>

              <h3 className={styles.antiCheatTitle}>⚠️ Anti-Cheating Rules</h3>
              <p className={styles.antiCheatSubtitle}>The following actions are monitored and will result in interview termination after 2 violations:</p>
              <ul className={styles.antiCheatList}>
                <li>🚫 <strong>Tab Switching</strong> — Do not switch to other browser tabs or windows</li>
                <li>🚫 <strong>Leaving the Window</strong> — Do not click outside or Alt+Tab away from this window</li>
                <li>🚫 <strong>Exiting Fullscreen</strong> — The interview runs in fullscreen mode; do not exit it</li>
                <li>🚫 <strong>Copy / Paste</strong> — Copy and paste are disabled during the interview</li>
                <li>🚫 <strong>Right-Click</strong> — Right-click context menu is disabled</li>
                <li>🚫 <strong>Text Selection</strong> — Selecting text on the page is not allowed</li>
                <li>🚫 <strong>Multi-Monitor</strong> — Moving the browser to another display is not allowed</li>
                <li>⏳ <strong>Idle Timeout</strong> — If no activity is detected for 10 seconds, a warning will be triggered</li>
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

          <div className={styles.messages}>
            {messages.map((message, index) => (
              <div key={index} className={`${styles.message} ${styles[message.role]}`}>
                <div className={styles.messageContent}>{message.content}</div>
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
            ))}
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

          {!isComplete && (
            <form onSubmit={handleSubmit} className={styles.inputForm}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() && !isLoading && interviewId) {
                      handleSubmit(e as unknown as React.FormEvent);
                    }
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
