'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../login/page.module.css';
import BrandLogos from '@/components/BrandLogos';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    if (!token) {
      setError('Invalid or missing token.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/candidate/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || data.error || 'Something went wrong.');
      } else {
        setMessage(data.message || 'Password reset successfully.');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      {/* ─── Left panel: Info & Branding (Identical to Login) ─── */}
      <div className={styles.leftPane}>
        <div className={styles.leftContent}>
          {/* Logo + subtitle */}
          <div className={styles.topBar}>
            <BrandLogos variant="login" />
          </div>

          {/* Hero heading + tagline */}
          <div className={styles.hero}>
            <h1 className={styles.heading}>
              Welcome to<br />
              <span className={styles.anveshanText}>ANVESHAN</span>
            </h1>
            <p className={styles.description}>
              <span className={styles.descHighlight}>AI-Powered Agricultural Interview Platform</span><br />
              <span className={styles.descEmphasis}>Evaluating talent with intelligent, adaptive interviews</span><br />
              <span className={styles.descEmphasis}>designed for the future of agriculture.</span>
            </p>
          </div>

          {/* Getting Started section */}
          <div className={styles.gettingStartedCard}>
            <div className={styles.gettingStartedCardInner}>
            <div className={styles.gettingStartedLeft}>
              <p className={styles.sectionLabel}>Getting Started</p>
              <h2 className={styles.gettingStartedTitle}>A quick walkthrough to get started</h2>
              <p className={styles.gettingStartedSub}>Watch a tour of ANVESHAN — from signup to documents submission.</p>
            </div>

            <div className={styles.gettingStartedRight}>
              <a
                href="https://youtu.be/D22IYyDw5ME"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.videoCard}
                aria-label="Watch platform walkthrough"
              >
                <img
                  src="https://img.youtube.com/vi/D22IYyDw5ME/maxresdefault.jpg"
                  alt="Platform walkthrough thumbnail"
                  className={styles.videoThumb}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className={styles.videoOverlay}>
                  <div className={styles.playBtn}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                </div>
              </a>
            </div>
            </div>
          </div>

          {/* Compact FAQ section */}
          <div className={styles.faqSectionCard}>
            <div className={styles.faqSectionCardInner}>
            <div className={styles.faqSection}>
              <div className={styles.faqSectionHeader}>
                <h3 className={styles.faqSectionTitle}>FAQs</h3>
                <button
                  className={styles.viewAllFaq}
                  onClick={() => router.push('/faq')}
                  aria-label="View all FAQs"
                >
                  View all FAQs
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
              </div>
              <p className={styles.faqSectionSub}>Get answers to common questions you may have</p>
              <ul className={styles.faqList}>
                <li className={styles.faqItem} onClick={() => router.push('/faq')}>
                  <span className={styles.faqDot} />
                  Who is eligible to apply for the internship program?
                </li>
                <li className={styles.faqItem} onClick={() => router.push('/faq')}>
                  <span className={styles.faqDot} />
                  What documents do I need to upload?
                </li>
                <li className={styles.faqItem} onClick={() => router.push('/faq')}>
                  <span className={styles.faqDot} />
                  How does the AI interview process work?
                </li>
              </ul>
            </div>
            </div>
          </div>
        </div>

        {/* Footer trust row */}
        <div className={styles.footerBullets}>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> Developed at Annam.ai, IIT Ropar
          </span>
          <span className={styles.bulletDivider}>|</span>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> Adaptive AI Interviews
          </span>
          <span className={styles.bulletDivider}>|</span>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> Secure &amp; Fair Evaluation
          </span>
        </div>
      </div>

      {/* ─── Right panel: Reset Password ─── */}
      <div className={styles.rightPane}>
        <img
          src="/login/Blue and Peach Simple Sleep Numbered Tips Instagram Post (2).png"
          alt=""
          className={styles.rightPaneBg}
          aria-hidden="true"
        />
        <div className={styles.loginBox}>
          <div className={styles.lockIconHeader}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <p className={styles.subtitle} style={{ textAlign: 'center', marginBottom: '24px' }}>
            Set New Password
          </p>

          {!token ? (
            <p className={styles.error} style={{ textAlign: 'center' }}>Invalid or missing token. Please use the link from your email.</p>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label htmlFor="password" className={styles.label}>New Password</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={styles.input}
                    placeholder="Min. 6 characters"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className={styles.eyeButton}>
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="confirmPassword" className={styles.label}>Confirm New Password</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={styles.input}
                    placeholder="Min. 6 characters"
                    required
                  />
                </div>
              </div>

              {error && <p className={styles.error}>{error}</p>}
              {message && <p className={styles.success} style={{ color: 'green', fontSize: '0.9rem', marginBottom: '16px' }}>{message}</p>}

              <button type="submit" className={styles.button} disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <p className={styles.footer} style={{ marginTop: '20px' }}>
                <span className={styles.link} onClick={() => router.push('/login')}>
                  Back to Sign in
                </span>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
