'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './ProfileNavButton.module.css';

interface Props {
  className?: string;
  forceShow?: boolean;
  showFaqHeaderButton?: boolean;
}

export default function ProfileNavButton({
  className,
  forceShow = false,
  showFaqHeaderButton = true,
}: Props) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isOnboardingDone, setIsOnboardingDone] = useState(forceShow);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPhase, setCurrentPhase] = useState('onboarding');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const loadInfo = async () => {
      try {
        const storedName = sessionStorage.getItem('candidateFullName') || localStorage.getItem('candidateFullName');
        if (storedName) setFullName(storedName);

        const res = await fetch('/api/candidate', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.fullName) {
            setFullName(data.fullName);
            setEmail(data.email || '');
            setCurrentPhase(data.currentPhase || 'onboarding');
            if (data.currentPhase !== 'onboarding') {
              setIsOnboardingDone(true);
              localStorage.setItem('onboardingCompleted', 'true');
            }
          }
        }
      } catch {
        // Ignore
      }
    };

    loadInfo();
  }, [forceShow]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getFirstName = (name: string) => {
    if (!name) return 'Account';
    const first = name.trim().split(' ')[0];
    return first.length > 12 ? `${first.slice(0, 10)}…` : first;
  };

  if (!isOnboardingDone && !forceShow) {
    return null;
  }

  return (
    <div className={`${styles.headerNavGroup} ${className || ''}`}>
      {/* Direct FAQ & Help Header Link */}
      {showFaqHeaderButton && (
        <button
          type="button"
          onClick={() => router.push('/faq')}
          className={styles.faqHeaderBtn}
          title="FAQ & Guidelines"
        >
          <svg
            className={styles.faqHeaderIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>FAQ & Help</span>
        </button>
      )}

      {/* Avatar Dropdown Container */}
      <div className={styles.headerMenuContainer} ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`${styles.avatarTrigger} ${isOpen ? styles.open : ''}`}
          aria-expanded={isOpen}
          aria-haspopup="true"
          title="Account & Profile Menu"
        >
          <div className={styles.avatarCircle}>{getInitials(fullName || email)}</div>
          <span className={styles.avatarName}>{getFirstName(fullName)}</span>
          <svg
            className={styles.chevronIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {/* Floating Dropdown Card */}
        {isOpen && (
          <div className={styles.dropdownMenu}>
            <div className={styles.dropdownHeader}>
              <p className={styles.dropdownUserName}>{fullName || 'Candidate'}</p>
              {email && <p className={styles.dropdownUserEmail}>{email}</p>}
              <span className={styles.phaseBadge}>Phase: {currentPhase}</span>
            </div>

            <div className={styles.menuList}>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/profile');
                }}
                className={styles.menuItem}
              >
                <svg
                  className={styles.itemSvg}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className={styles.menuItemLabel}>My Profile & Consent</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/dashboard');
                }}
                className={styles.menuItem}
              >
                <svg
                  className={styles.itemSvg}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </svg>
                <span className={styles.menuItemLabel}>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  window.open('/raise-ticket.html', '_blank');
                }}
                className={styles.menuItem}
              >
                <svg
                  className={styles.itemSvg}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className={styles.menuItemLabel}>Raise Support Ticket</span>
                <svg
                  className={styles.externalIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>

              <div className={styles.menuDivider} />

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className={`${styles.menuItem} ${styles.signOutItem}`}
              >
                <svg
                  className={styles.itemSvg}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className={styles.menuItemLabel}>
                  {loggingOut ? 'Signing out...' : 'Sign Out'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
