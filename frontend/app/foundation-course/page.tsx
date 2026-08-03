'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { syncPhaseToDb } from '@/lib/phaseSync';
import styles from './page.module.css';

type CourseStatus = 'not_started' | 'completed';

const VIBE_COURSE_URL = 'https://vibe.vicharanashala.ai/student/course-registration/6a2be954ca990e71be4e3752';

export default function FoundationCoursePage() {
  const [courseStatus, setCourseStatus] = useState<CourseStatus>('not_started');
  const [isChecking, setIsChecking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const isRequestInFlight = useRef(false);
  const router = useRouter();

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
        setCourseStatus('completed');
        localStorage.setItem('foundationCourseCompleted', 'completed');
        await syncPhaseToDb(4, { foundationCourseCompleted: true });
        setFeedback({
          type: 'success',
          text: 'Foundation Course verified successfully. You can now proceed to Upload Documents.',
        });
      } else if (data.vibeError) {
        setFeedback({
          type: 'error',
          text: 'Unable to verify your Foundation Course right now. Please try again in a few minutes.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: 'Your Foundation Course has not been completed yet. Please complete the course on ViBe and check again.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'Unable to verify your Foundation Course right now. Please try again in a few minutes.',
      });
    } finally {
      setIsChecking(false);
      isRequestInFlight.current = false;
    }
  };

  const handleFaqClick = () => {
    router.push('/faq');
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    const redisToken = sessionStorage.getItem('candidate_session_token');
    if (redisToken) {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL;
      fetch(`${backendUrl}/api/candidate/session/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
      }).catch(() => {});
    }

    sessionStorage.clear();
    localStorage.clear();
    await signOut({ redirect: false });
    router.push('/login');
  };

  return (
    <main className={styles.container}>
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <div className={styles.logoWrapper}>
            <img
          src="/annam-logo.png"
          alt="ANNAM.AI"
          className={styles.logo}
        />
            <p className={styles.brandSub}>Center of Excellence for AI in Agriculture, IIT Ropar</p>
          </div>
          <div className={styles.headerButtons}>
            <button onClick={handleFaqClick} className={styles.faqHelpBtn}>
              FAQ & Help
            </button>
            <button onClick={handleLogout} disabled={loggingOut} className={styles.signOutBtn}>
              {loggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </nav>

      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>Foundation Course</h1>
          <p className={styles.subtitle}>
            Complete the mandatory Foundation Course on ViBe before uploading your documents.
          </p>
          <div className={`${styles.statusBadge} ${courseStatus === 'completed' ? styles.statusCompleted : styles.statusPending}`}>
            <span className={styles.statusDot} />
            {courseStatus === 'not_started' ? 'Not Started' : 'Completed'}
          </div>
        </div>

        {feedback && (
          <div className={`${styles.feedback} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
            {feedback.text}
          </div>
        )}

        <div className={styles.card}>
          {courseStatus === 'not_started' ? (
            <>
              <div className={styles.cardIcon}>FC</div>
              <h2 className={styles.cardTitle}>Ready to Begin?</h2>
              <p className={styles.cardText}>
                Launch the Foundation Course on ViBe and complete all required modules. Once done, come back and check your completion status.
              </p>
              <div className={styles.actions}>
                <button onClick={handleLaunchCourse} className={styles.primaryButton}>
                  Launch Course
                </button>
                <button onClick={handleCheckCompletion} disabled={isChecking} className={styles.secondaryButton}>
                  {isChecking && <span className={styles.spinner} />}
                  {isChecking ? 'Checking...' : 'Check Completion'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.cardIcon}>OK</div>
              <h2 className={styles.cardTitle}>Course Completed!</h2>
              <p className={styles.cardText}>
                You have completed the Foundation Course. You can now proceed to upload your documents.
              </p>
              <button onClick={() => router.push('/upload-documents')} className={styles.primaryButton}>
                Proceed to Upload Documents
              </button>
            </>
          )}
        </div>

        <div className={styles.backRow}>
          <button onClick={() => router.push('/dashboard')} className={styles.backButton}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
