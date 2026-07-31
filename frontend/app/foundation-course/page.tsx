'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { syncPhaseToDb } from '@/lib/phaseSync';

type CourseStatus = 'not_started' | 'completed';

const VIBE_COURSE_URL = 'https://vibe.vicharanashala.ai/student/course-registration/6a2be954ca990e71be4e3752';

export default function FoundationCoursePage() {
  const [courseStatus, setCourseStatus] = useState<CourseStatus>('not_started');
  const [isChecking, setIsChecking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const isRequestInFlight = useRef(false);
  const router = useRouter();

  // Load persisted completion state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('foundationCourseCompleted');
    if (stored === 'completed') {
      setCourseStatus('completed');
    }
  }, []);

  const handleLaunchCourse = async () => {
    window.open(VIBE_COURSE_URL, '_blank', 'noopener,noreferrer');
    try {
      const rt = sessionStorage.getItem('candidate_session_token');
      await fetch('/api/foundation-course/launch', {
        method: 'POST',
        headers: rt ? { 'x-redis-token': rt } : {},
      });
    } catch (err) {
      console.error('Failed to notify backend of course launch:', err);
    }
  };

  const handleCheckCompletion = async () => {
    // Guard against duplicate requests
    if (isChecking || isRequestInFlight.current) return;
    isRequestInFlight.current = true;
    setIsChecking(true);
    setFeedback(null);

    try {
      const rt = sessionStorage.getItem('candidate_session_token');
      const res = await fetch('/api/foundation-course/check-completion', {
        headers: rt ? { 'x-redis-token': rt } : {},
      });
      const data = await res.json();

      if (data.alreadyVerified || data.completed) {
        // Mark done locally and sync to backend DB
        setCourseStatus('completed');
        localStorage.setItem('foundationCourseCompleted', 'completed');
        await syncPhaseToDb(4, { foundationCourseCompleted: true });
        setFeedback({
          type: 'success',
          text: '✓ Foundation Course verified successfully. You can now proceed to Upload Documents.',
        });
      } else if (data.vibeError) {
        // ViBe was unreachable — do NOT mark incomplete
        setFeedback({
          type: 'error',
          text: 'Unable to verify your Foundation Course right now. Please try again in a few minutes.',
        });
      } else {
        // Candidate not found in ViBe completion list
        setFeedback({
          type: 'error',
          text: 'Your Foundation Course has not been completed yet. Please complete the course on ViBe and check again.',
        });
      }
    } catch {
      // Network error — do NOT mark incomplete; preserve existing state
      setFeedback({
        type: 'error',
        text: 'Unable to verify your Foundation Course right now. Please try again in a few minutes.',
      });
    } finally {
      setIsChecking(false);
      isRequestInFlight.current = false;
    }
  };

  const statusBadgeColor = courseStatus === 'completed' ? '#08CB00' : '#ffc200';

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', color: '#fff' }}>

        <h1 style={{ color: '#08CB00', fontSize: 22, margin: '0 0 6px' }}>Foundation Course</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 28px', fontSize: 14 }}>
          Complete the mandatory Foundation Course on ViBe before proceeding with onboarding.
        </p>

        {/* Status Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: courseStatus === 'completed'
            ? 'rgba(8,203,0,0.1)'
            : 'rgba(255,200,0,0.1)',
          border: `1px solid ${
            courseStatus === 'completed'
              ? 'rgba(8,203,0,0.3)'
              : 'rgba(255,200,0,0.3)'
          }`,
          borderRadius: 8,
          padding: '8px 16px',
          marginBottom: 28,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusBadgeColor,
          }} />
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: statusBadgeColor,
          }}>
            {courseStatus === 'not_started' ? 'Not Started' : 'Completed'}
          </span>
        </div>

        {/* Feedback message (success or error) */}
        {feedback && (
          <div style={{
            background: feedback.type === 'success'
              ? 'rgba(8,203,0,0.12)'
              : 'rgba(239,68,68,0.12)',
            border: `1px solid ${
              feedback.type === 'success'
                ? 'rgba(8,203,0,0.3)'
                : 'rgba(239,68,68,0.25)'
            }`,
            color: feedback.type === 'success' ? '#86efac' : '#fca5a5',
            padding: '12px 16px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 20,
            lineHeight: 1.6,
          }}>
            {feedback.text}
          </div>
        )}

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
        }}>
          {courseStatus === 'not_started' ? (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(8,203,0,0.15)',
                border: '1px solid rgba(8,203,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 24, color: '#08CB00',
              }}>
                📚
              </div>
              <h2 style={{ color: '#fff', fontSize: 18, margin: '0 0 8px' }}>
                Ready to Begin?
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
                Launch the Foundation Course on ViBe and complete all required modules.
                Once done, come back and check your completion status.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleLaunchCourse}
                  style={{
                    background: '#08CB00',
                    color: '#000',
                    border: 'none',
                    borderRadius: 8,
                    padding: '11px 28px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'system-ui',
                  }}
                >
                  Launch Course
                </button>
                <button
                  onClick={handleCheckCompletion}
                  disabled={isChecking}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(8,203,0,0.4)',
                    color: '#08CB00',
                    borderRadius: 8,
                    padding: '11px 28px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: isChecking ? 'not-allowed' : 'pointer',
                    opacity: isChecking ? 0.6 : 1,
                    fontFamily: 'system-ui',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 160,
                    justifyContent: 'center',
                  }}
                >
                  {isChecking && (
                    <span style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      border: '2px solid rgba(8,203,0,0.4)',
                      borderTop: '2px solid #08CB00',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                  )}
                  {isChecking ? 'Checking...' : 'Check Completion'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(8,203,0,0.15)',
                border: '1px solid rgba(8,203,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 24, color: '#08CB00',
              }}>
                ✓
              </div>
              <h2 style={{ color: '#08CB00', fontSize: 18, margin: '0 0 8px' }}>
                Course Completed!
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
                You have completed the Foundation Course. You can now proceed to upload your documents.
              </p>
              <button
                onClick={() => router.push('/upload-documents')}
                style={{
                  background: '#08CB00',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  padding: '11px 28px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'system-ui',
                }}
              >
                Proceed to Upload Documents
              </button>
            </>
          )}
        </div>

        {/* Back navigation */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'system-ui',
              padding: 0,
            }}
          >
            ← Back to Dashboard
          </button>
        </div>

      </div>

      {/* Keyframe for spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}