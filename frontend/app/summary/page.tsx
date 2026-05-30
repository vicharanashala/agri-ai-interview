'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';

interface MetricScore {
  score: number;
  details: string;
}

interface EvaluationResult {
  interview_id: string;
  overall_score: number;
  metrics: {
    motivation: MetricScore;
    agri_knowledge: MetricScore;
    communication: MetricScore;
    problem_solving: MetricScore;
    [key: string]: MetricScore;
  };
  summary: string;
  strengths: string[];
  areas_for_improvement: string[];
  recommendation: string;
  status?: string;
}

export default function SummaryPage() {
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchEvaluation = async () => {
      try {
        // First, check if evaluation data is already cached from interview page
        const cachedEvaluation = localStorage.getItem('interviewEvaluation');
        if (cachedEvaluation) {
          console.log('[Summary] Using cached evaluation data');
          const evaluationData = JSON.parse(cachedEvaluation);
          setEvaluation(evaluationData);
          // Mark that user has visited summary page (for both pass and fail)
          localStorage.setItem('passedAndVisitedSummary', 'true');
          setLoading(false);
          return;
        }

        // Get interview data from localStorage (keys set by interview page)
        const interviewData = localStorage.getItem('currentInterview');
        const candidateData = localStorage.getItem('candidateDataForSummary') || localStorage.getItem('candidateFormData');
        const conversationHistory = localStorage.getItem('interviewConversationHistory') || localStorage.getItem('conversationHistory');
        const interviewPhase = localStorage.getItem('interviewPhase');

        if (!interviewData && interviewPhase !== '3') {
          throw new Error('No interview data found. Please complete the interview first.');
        }

        const interview = interviewData ? JSON.parse(interviewData) : { interviewId: 'demo-session' };
        const candidate = candidateData ? JSON.parse(candidateData) : {};
        const history = conversationHistory ? JSON.parse(conversationHistory) : [];

        // Call the evaluation API with user email for admin bypass
        const response = await fetch('/api/interview/evaluate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            interview_id: interview.interviewId || interview.interview_id,
            candidate_data: candidate,
            conversation_history: history,
            user_email: candidate?.email || localStorage.getItem('userEmail'),
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch evaluation');
        }

        const data = await response.json();
        console.log('[Summary] Got evaluation from API:', data);
        
        // Cache the evaluation for future use
        localStorage.setItem('interviewEvaluation', JSON.stringify(data));
        
        // Mark that user has visited summary page (for both pass and fail)
        localStorage.setItem('passedAndVisitedSummary', 'true');
        
        setEvaluation(data);
      } catch (err) {
        console.error('Error fetching evaluation:', err);
        setError(err instanceof Error ? err.message : 'Failed to load evaluation');
        
        // Set dummy data as fallback for demo
        setEvaluation({
          interview_id: 'demo-interview-001',
          overall_score: 78,
          metrics: {
            motivation: { score: 85, details: 'Demonstrated strong passion for agriculture' },
            agri_knowledge: { score: 72, details: 'Good understanding of farming practices' },
            communication: { score: 80, details: 'Clear and articulate communication' },
            problem_solving: { score: 75, details: 'Showed good problem-solving abilities' },
          },
          summary: 'The candidate demonstrated strong motivation and enthusiasm for the agricultural technology sector. They showed good communication skills and were able to articulate their thoughts clearly. Their understanding of modern farming practices and agribusiness concepts was solid, though there is room for growth in technical areas. Overall, the candidate presents as a promising fit for the role with potential for further development.',
          strengths: ['Strong communication skills', 'Passionate about agriculture', 'Good problem-solving abilities', 'Willingness to learn'],
          areas_for_improvement: ['Technical knowledge could be deeper', 'Could benefit from more hands-on experience', 'Limited exposure to modern agri-tech'],
          recommendation: 'Consider - The candidate shows promise and fits well with the team culture. Recommend for further rounds.',
          status: 'completed',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEvaluation();
  }, []);

  const handleContinue = async () => {
    localStorage.setItem('interviewPhase', '4');

    // If student passed, mark as passed and visited summary to unlock offer letter phase
    if (evaluation && evaluation.overall_score > 1) {
      localStorage.setItem('passedAndVisitedSummary', 'true');
    }

    await syncPhaseToDb(4);
    router.push('/dashboard');
  };

  const handleRestartInterview = () => {
    // Clear interview-related localStorage data
    localStorage.removeItem('interviewEvaluation');
    localStorage.removeItem('currentInterview');
    localStorage.removeItem('interviewConversationHistory');
    localStorage.removeItem('conversationHistory');
    localStorage.removeItem('interviewPhase');
    // Redirect to interview page
    router.push('/interview');
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e'; // Green
    if (score >= 60) return '#eab308'; // Yellow
    if (score >= 40) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const getRecommendationColor = (rec: string) => {
    const lower = rec.toLowerCase();
    if (lower.includes('hire')) return '#22c55e';
    if (lower.includes('consider')) return '#eab308';
    return '#ef4444';
  };

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.content}>
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} />
            <p>Generating your interview summary...</p>
            <span className={styles.loadingHint}>This may take a few moments</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h1>Interview Summary</h1>
            <p>Your AI-powered interview evaluation results</p>
          </div>
          <button 
            className={styles.dashboardButton}
            onClick={() => router.push('/dashboard')}
          >
            ← Go to Dashboard
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            Note: {error}. Showing demo data.
          </div>
        )}

        {evaluation && (
          <>
            <div className={styles.overallScore}>
              <div 
                className={styles.scoreCircle}
                style={{ borderColor: getScoreColor(evaluation.overall_score) }}
              >
                <span className={styles.scoreValue}>{evaluation.overall_score}</span>
                <span className={styles.scoreMax}>/100</span>
              </div>
              <div className={styles.scoreLabel} style={{ color: getScoreColor(evaluation.overall_score) }}>
                {getScoreLabel(evaluation.overall_score)}
              </div>
              <div 
                className={styles.passFailBadge}
                style={{ 
                  backgroundColor: evaluation.overall_score > 1 ? '#22c55e' : '#ef4444',
                  color: 'white'
                }}
              >
                {evaluation.overall_score > 1 ? '✓ PASSED' : '✗ FAILED'}
              </div>
            </div>

            <div className={styles.metricsGrid}>
              <h2>Evaluation Metrics</h2>
              <div className={styles.metricsCards}>
                {['motivation', 'agri_knowledge', 'communication', 'problem_solving'].map((metricKey) => {
                  const metricData = evaluation.metrics[metricKey];
                  if (!metricData) return null;
                  
                  const score = typeof metricData === 'object' ? metricData.score : metricData;
                  const details = typeof metricData === 'object' ? metricData.details : '';
                  
                  const metricLabels: Record<string, { name: string; icon: string }> = {
                    motivation: { name: 'Motivation', icon: '🎯' },
                    agri_knowledge: { name: 'Agriculture Knowledge', icon: '🌱' },
                    communication: { name: 'Communication', icon: '💬' },
                    problem_solving: { name: 'Problem Solving', icon: '🧠' }
                  };
                  
                  const label = metricLabels[metricKey] || { name: metricKey.replace(/_/g, ' '), icon: '📊' };
                  
                  return (
                    <div key={metricKey} className={styles.metricCard}>
                      <div className={styles.metricCardHeader}>
                        <span className={styles.metricIcon}>{label.icon}</span>
                        <span className={styles.metricCardName}>{label.name}</span>
                        <span className={styles.metricCardScore} style={{ color: getScoreColor(score) }}>
                          {score}/10
                        </span>
                      </div>
                      <div className={styles.metricCardBar}>
                        <div 
                          className={styles.metricCardFill}
                          style={{ 
                            width: `${score * 10}%`,
                            backgroundColor: getScoreColor(score)
                          }}
                        />
                      </div>
                      {details && (
                        <p className={styles.metricCardDetails}>{details}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.summarySection}>
              <h2>Interview Summary</h2>
              <div className={styles.summaryContent}>
                <p>{evaluation.summary}</p>
              </div>
            </div>

            {evaluation.strengths && evaluation.strengths.length > 0 && (
              <div className={styles.strengthsSection}>
                <h2>Key Strengths</h2>
                <ul className={styles.strengthsList}>
                  {evaluation.strengths.map((strength, index) => (
                    <li key={index}>{strength}</li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.areas_for_improvement && evaluation.areas_for_improvement.length > 0 && (
              <div className={styles.improvementSection}>
                <h2>Areas for Improvement</h2>
                <ul className={styles.improvementList}>
                  {evaluation.areas_for_improvement.map((area, index) => (
                    <li key={index}>{area}</li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.recommendation && (
              <div 
                className={styles.recommendationSection}
                style={{ borderColor: getRecommendationColor(evaluation.recommendation) }}
              >
                <h2>Recommendation</h2>
                <p style={{ color: getRecommendationColor(evaluation.recommendation) }}>
                  {evaluation.recommendation}
                </p>
              </div>
            )}

            <div className={styles.actions}>
              {evaluation.overall_score > 1 ? (
                <button 
                  onClick={() => router.push('/dashboard')} 
                  className={styles.offerLetterButton}
                >
                  Go to Dashboard for Your Offer Letter
                </button>
              ) : (
                <>
                  <button 
                    onClick={handleRestartInterview} 
                    className={styles.restartButton}
                  >
                    Start Interview Again
                  </button>
                  <button 
                    onClick={() => router.push('/dashboard')} 
                    className={styles.offerLetterButton}
                  >
                    Go to Dashboard
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}