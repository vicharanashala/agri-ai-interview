'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import styles from './ProfileNavButton.module.css';

interface Props {
  className?: string;
  forceShow?: boolean;
}

export default function ProfileNavButton({ className, forceShow = false }: Props) {
  const router = useRouter();
  const [isOnboardingDone, setIsOnboardingDone] = React.useState(forceShow);

  React.useEffect(() => {
    if (forceShow) return;

    const checkStatus = async () => {
      try {
        const stored = localStorage.getItem('onboardingCompleted');
        if (stored === 'true') {
          setIsOnboardingDone(true);
          return;
        }

        const res = await fetch('/api/candidate', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.fullName && data.currentPhase !== 'onboarding') {
            setIsOnboardingDone(true);
            localStorage.setItem('onboardingCompleted', 'true');
          }
        }
      } catch {
        // Ignore
      }
    };

    checkStatus();
  }, [forceShow]);

  if (!isOnboardingDone) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => router.push('/profile')}
      className={`${styles.profileNavBtn} ${className || ''}`}
      title="My Profile & Settings"
      aria-label="Profile"
    >
      <svg
        className={styles.profileIcon}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span>Profile</span>
    </button>
  );
}
