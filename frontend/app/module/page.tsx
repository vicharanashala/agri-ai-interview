'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { syncPhaseToDb } from '@/lib/phaseSync';
import styles from './page.module.css';
import BrandLogos from '@/components/BrandLogos';
import ProfileNavButton from '@/components/ProfileNavButton';

const QC_URL = process.env.NEXT_PUBLIC_QC_URL || 'https://question-collection-staging-239934307367.asia-south1.run.app';

interface Requirements {
  questions: { required: number; submitted: number; met: boolean };
  crop: { required: number; submitted: number; met: boolean };
  pest: { required: number; submitted: number; met: boolean };
  weed: { required: number; submitted: number; met: boolean };
  disease: { required: number; submitted: number; met: boolean };
}

export default function ModulePage() {
  const router = useRouter();
  const [courseStatus, setCourseStatus] = useState<'pending' | 'completed'>('pending');
  const [isChecking, setIsChecking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  
  const isRequestInFlight = useRef(false);

  useEffect(() => {
    const checkInitialStatus = async () => {
      const stored = localStorage.getItem('moduleCompleted');
      if (stored === 'completed') {
        setCourseStatus('completed');
        return;
      }
      try {
        const res = await fetch('/api/candidate');
        if (res.ok) {
          const candidate = await res.json();
          if (candidate && candidate.moduleCompleted) {
            setCourseStatus('completed');
            localStorage.setItem('moduleCompleted', 'completed');
          }
        }
      } catch (err) {
        console.error('Failed to fetch candidate profile:', err);
      }
    };
    checkInitialStatus();
  }, []);

  const handleLaunchCourse = async () => {
    window.open(QC_URL, '_blank', 'noopener,noreferrer');
    try {
      const rt = sessionStorage.getItem('candidate_session_token');
      await fetch('/api/module/launch', {
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
      const res = await fetch('/api/module/check-completion', {
        headers: rt ? { 'x-redis-token': rt } : {},
      });
      const data = await res.json();

      if (data.alreadyVerified || data.completed) {
        setCourseStatus('completed');
        localStorage.setItem('moduleCompleted', 'completed');
        await syncPhaseToDb(5, { moduleCompleted: true });
        setFeedback({
          type: 'success',
          text: 'Module verified successfully. You can now proceed to Upload Documents.',
        });
      } else if (data.apiError) {
        setFeedback({
          type: 'error',
          text: 'Unable to verify your Module status right now. Please try again in a few minutes.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: 'Your Module has not been completed yet. Please complete the tasks on Question Collection and check again.',
        });
        if (data.requirements) {
          setRequirements(data.requirements);
        }
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'Unable to verify your Module status right now. Please try again in a few minutes.',
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
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'x-redis-token': redisToken },
        });
      } catch (err) {
        console.error('Logout failed:', err);
      }
    }
    sessionStorage.removeItem('candidate_session_token');
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <main className={styles.container}>
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <BrandLogos variant="header" />
          <div className={styles.headerButtons}>
            <ProfileNavButton />
          </div>
        </div>
      </nav>

      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>Question Collection Module</h1>
          <p className={styles.subtitle}>
            Complete the mandatory Question Collection Module on Anveshan before uploading your documents.
          </p>
          <div className={`${styles.statusBadge} ${courseStatus === 'completed' ? styles.statusCompleted : styles.statusPending}`}>
            <span className={styles.statusDot} />
            {courseStatus === 'completed' ? 'Completed' : 'Pending'}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardContent}>
            {courseStatus === 'pending' ? (
              <>
                <div className={styles.cardIcon}>QC</div>
                <h2 className={styles.cardTitle}>Ready to Begin?</h2>
                <p className={styles.cardText}>
                  Launch the Question Collection Module and complete all required tasks. Once done, come back and check your completion status.
                </p>
                <div className={styles.actions}>
                  <button onClick={handleLaunchCourse} className={styles.primaryButton}>
                    Launch Application
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
                <h2 className={styles.cardTitle}>Module Completed!</h2>
                <p className={styles.cardText}>
                  You have completed the Question Collection Module. You can now proceed to upload your documents.
                </p>
                <button onClick={() => router.push('/upload-documents')} className={styles.primaryButton}>
                  Proceed to Upload Documents
                </button>
              </>
            )}
          </div>
        </div>

        {feedback && (
          <div className={`${styles.feedback} ${feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess}`}>
            {feedback.text}
          </div>
        )}

        <div className={styles.backRow}>
          <button onClick={() => router.push('/dashboard')} className={styles.backButton}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
