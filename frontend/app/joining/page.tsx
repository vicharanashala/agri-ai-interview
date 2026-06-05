'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';
import { interceptAuthFetch } from '@/lib/auth-fetch';

export default function JoiningPage() {
  const router = useRouter();

  useEffect(() => {
    const restore = interceptAuthFetch();
    return restore;
  }, []);

  useEffect(() => {
    const currentPhase = localStorage.getItem('interviewPhase');
    const result = localStorage.getItem('interviewResult');
    if (!result || result !== 'PASS') {
      router.push('/dashboard');
      return;
    }
    if (!currentPhase || parseInt(currentPhase) < 6) {
      router.push('/dashboard');
      return;
    }

    localStorage.setItem('joiningDetailsVisited', 'true');
    syncPhaseToDb(6, { joiningDetailsVisited: true });
  }, [router]);

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  return (
    <main className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>📋</div>
        <h1 className={styles.title}>Joining Details</h1>
        <p className={styles.message}>
          Your joining details will be shared soon over the email you provided.
        </p>
        <button onClick={handleGoToDashboard} className={styles.dashboardButton}>
          Back to Dashboard
        </button>
      </div>
    </main>
  );
}