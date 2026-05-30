'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';
import { useAntiCheat, type ViolationType } from '@/hooks/useAntiCheat';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationHistory[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<CumulativeEvaluation | null>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEndConfirmDialog, setShowEndConfirmDialog] = useState(false);
  const [isInterviewCompleted, setIsInterviewCompleted] = useState(false);
  const [cheatWarning, setCheatWarning] = useState<{
    visible: boolean
    type: ViolationType | null
    count: number
  }>({ visible: false, type: null, count: 0 });
  const [isClosing, setIsClosing] = useState(false);
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
      await fetch(`/api/interview/end/${interviewId}`, { method: 'POST' })
    }
    sessionStorage.setItem('interviewTerminatedCheat', 'true')
    sessionStorage.setItem('interviewPhase', '3')
    localStorage.setItem('interviewPhase', '3')
    await syncPhaseToDb(3)
    router.push('/summary?terminated=true')
  }, [interviewId, router])

  // Anti-cheat: log violation to backend (fire-and-forget)
  const handleCheatLog = useCallback((type: ViolationType) => {
    const candidateId = sessionStorage.getItem('candidateId') || ''
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input whenever a new AI question arrives
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'ai' && !isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [messages, isLoading]);

  // Check if interview is already completed on page load
  useEffect(() => {
    const checkInterviewStatus = async () => {
      // First check localStorage
      const wasCompleted = localStorage.getItem('interviewCompleted') === 'true' || 
                           sessionStorage.getItem('interviewCompleted') === 'true';
      
      if (wasCompleted) {
        setIsInterviewCompleted(true);
        setShowInstructions(false);
        return;
      }

      // Then check backend
      try {
        const response = await fetch('/api/interview/status/check');
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
    };

    checkInterviewStatus();
  }, []);

  const handleBeginInterview = async () => {
    // Check if interview was already completed
    const wasCompleted = localStorage.getItem('interviewCompleted') === 'true' || 
                         sessionStorage.getItem('interviewCompleted') === 'true';
    
    if (wasCompleted) {
      setError('Interview is already completed. Go to Interview Summary.');
      return;
    }

    resetAntiCheat();
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_data: {
            name: sessionStorage.getItem('candidateFullName') || 'Candidate',
            position: 'Software Developer'
          }
        }),
      });
      
      const data = await response.json();
      
      // Check for errors - specifically handle completed interview case
      if (!response.ok || data.error || !data.interviewId) {
        // Check if this is an "already completed" error from backend
        if (response.status === 400 && data.detail?.message?.includes('already completed')) {
          setError('Interview is already completed. Go to Interview Summary.');
          return;
        }
        const errorMsg = data.error || 'Failed to start interview. Please ensure the backend server is running.';
        console.error('Start interview error:', errorMsg, data);
        setError(errorMsg);
        return;
      }
      
      setInterviewId(data.interviewId);
      // Persist to localStorage so summary page can retrieve it
      localStorage.setItem('currentInterview', JSON.stringify({
        interviewId: data.interviewId,
        startedAt: new Date().toISOString(),
      }));
      setMessages([{ role: 'ai', content: data.question || data.greeting }]);
      setShowInstructions(false);
    } catch (error) {
      console.error('Failed to start interview:', error);
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
      const response = await fetch('/api/interview/message', {
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
        const evalRes = await fetch('/api/interview/evaluate', {
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
    if (!interviewId) {
      console.error('Interview not started');
      return;
    }

    setIsEnding(true);
    setError(null);

    try {
      // End the interview session
      const endRes = await fetch(`/api/interview/end/${interviewId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const endData = await endRes.json();

      if (!endRes.ok || endData.error) {
        const errorMessage = endData.error || 'Failed to end interview. Please try again.';
        console.error('End interview error:', errorMessage);
        setError(errorMessage);
        return;
      }

      // Build conversation history from messages state (strip extra fields)
      const history = messages
        .filter((m: any) => m.role === 'user' || m.role === 'ai')
        .map((m: any) => ({ role: m.role, content: m.content }));

      // Immediately fetch evaluation and cache it
      const evalRes = await fetch('/api/interview/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: interviewId,
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

  const handleConfirmEnd = async () => {
    // Close dialog immediately so user sees it go away
    setShowEndConfirmDialog(false);

    // Set Interview Summary (Phase 3) as current phase
    sessionStorage.setItem('interviewPhase', '3');
    localStorage.setItem('interviewPhase', '3');

    // Mark Start Interview (Phase 2) as completed
    sessionStorage.setItem('phase2_completed', 'true');
    localStorage.setItem('phase2_completed', 'true');

    // Sync to DB so admin dashboard sees the correct phase
    await syncPhaseToDb(3);

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

  return (
    <div className={styles.container}>
      {showInstructions ? (
        <div className={styles.instructionScreen}>
          <div className={styles.instructionCard}>
            <h1 className={styles.instructionTitle}>AI Interview</h1>
            <p className={styles.instructionSubtitle}>Welcome to your AI-powered interview session</p>
            
            <div className={styles.guidelines}>
              <h2>Guidelines</h2>
              <ul>
                <li>Answer each question to the best of your ability</li>
                <li>The interview will adapt based on your responses</li>
                <li>You will receive feedback after each answer</li>
                <li>The interview typically consists of 10 questions</li>
                <li>Be honest and thorough in your responses</li>
              </ul>
            </div>

            <div className={styles.evaluationInfo}>
              <h2>How You'll Be Evaluated</h2>
              <div className={styles.criteria}>
                <div className={styles.criteriaItem}>
                  <span className={styles.criteriaLabel}>Technical Accuracy</span>
                  <span className={styles.criteriaPercent}>40%</span>
                </div>
                <div className={styles.criteriaItem}>
                  <span className={styles.criteriaLabel}>Communication</span>
                  <span className={styles.criteriaPercent}>25%</span>
                </div>
                <div className={styles.criteriaItem}>
                  <span className={styles.criteriaLabel}>Problem Solving</span>
                  <span className={styles.criteriaPercent}>20%</span>
                </div>
                <div className={styles.criteriaItem}>
                  <span className={styles.criteriaLabel}>Relevance</span>
                  <span className={styles.criteriaPercent}>15%</span>
                </div>
              </div>
            </div>

            <button 
              className={styles.beginButton}
              onClick={handleBeginInterview}
              disabled={isStarting}
            >
              {isStarting ? 'Starting...' : 'Begin Interview'}
            </button>
          </div>
        </div>
      ) : (
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
    </div>
  );
}
