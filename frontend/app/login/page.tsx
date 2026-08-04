'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import OtpModal from '@/components/OtpModal/OtpModal';

// ── Registration step machine ────────────────────────────────────────────────
// step 1: email  →  step 2: otp  →  step 3: name+password
type RegisterStep = 1 | 2 | 3;

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  // ── View toggle: 'signin' | 'register' ───────────────────────
  const [view, setView] = useState<'signin' | 'register'>('register');

  // ── Sign-in state ────────────────────────────────────────────
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [showSignInPassword, setShowSignInPassword] = useState(false);

  // ── Register step machine ────────────────────────────────────
  const [regStep, setRegStep] = useState<RegisterStep>(1);
  const [regEmail, setRegEmail] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // ── OTP modal ────────────────────────────────────────────────
  const [otpOpen, setOtpOpen] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const isIdleTimeout = searchParams.get('reason') === 'idle';

  // ── Step 1: Send OTP ─────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegLoading(true);

    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRegError(data.detail ?? data.error ?? 'Failed to send verification code.');
        setRegLoading(false);
        return;
      }

      // Move to step 2 and open OTP modal
      setRegStep(2);
      setOtpOpen(true);
    } catch {
      setRegError('Network error. Please check your connection and try again.');
    } finally {
      setRegLoading(false);
    }
  };

  // ── Step 2: OTP verified ─────────────────────────────────────
  const handleOtpVerified = () => {
    setOtpOpen(false);
    setRegStep(3);
  };

  // ── Step 2 → Step 1 (go back) ────────────────────────────────
  const handleBackToEmail = () => {
    setOtpOpen(false);
    setRegStep(1);
    setRegError('');
  };

  // ── Step 3: Complete registration ────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (!regName.trim()) {
      setRegError('Please enter your full name.');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('Password must be at least 6 characters.');
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRegError(data.detail ?? data.error ?? 'Registration failed.');
        setRegLoading(false);
        return;
      }

      // Auto sign-in after successful registration
      const result = await signIn('credentials', {
        email: regEmail,
        password: regPassword,
        redirect: false,
      });

      if (result?.error) {
        setRegError('Account created but sign-in failed. Please sign in manually.');
        setRegStep(1);
        setRegLoading(false);
        return;
      }

      router.push('/post-login');
    } catch {
      setRegError('An error occurred. Please try again.');
      setRegLoading(false);
    }
  };

  // ── Sign-in submit ───────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError('');
    setSignInLoading(true);

    try {
      if (!signInEmail || !signInPassword) {
        setSignInError('Please fill in all fields');
        setSignInLoading(false);
        return;
      }

      const result = await signIn('credentials', {
        email: signInEmail,
        password: signInPassword,
        redirect: false,
      });

      if (result?.error) {
        setSignInError('Invalid email or password');
        setSignInLoading(false);
        return;
      }

      router.push('/post-login');
    } catch {
      setSignInError('An error occurred. Please try again.');
      setSignInLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      {/* ─── Left panel: Info & Branding ─────────────────── */}
      <div className={styles.leftPane}>
        <div className={styles.leftContent}>
          {/* Logo + subtitle */}
          <div className={styles.topBar}>
            <img src="/annam-logo.png" alt="ANNAM.AI" className={styles.logo} />
            <p className={styles.brandSub}>Center of Excellence for AI in Agriculture, IIT Ropar</p>
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
                href="https://youtu.be/6S5uX1-eSFw?si=tVe946WNdR_5TOGt"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.videoCard}
                aria-label="Watch platform walkthrough"
              >
                <img
                  src="https://img.youtube.com/vi/6S5uX1-eSFw/maxresdefault.jpg"
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

      {/* ─── Right panel: Login box with image background ─── */}
      <div className={styles.rightPane}>
        <img
          src="/login/Blue and Peach Simple Sleep Numbered Tips Instagram Post (2).png"
          alt=""
          className={styles.rightPaneBg}
          aria-hidden="true"
        />
        <div className={styles.loginBox}>
          {/* Lock icon header */}
          <div className={styles.lockIconHeader}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          {/* ─── View toggle tabs ───────────────────────────────── */}
          <div className={styles.viewTabs}>
            <button
              className={`${styles.viewTab} ${view === 'signin' ? styles.viewTabActive : ''}`}
              onClick={() => { setView('signin'); setSignInError(''); }}
            >
              Sign In
            </button>
            <button
              className={`${styles.viewTab} ${view === 'register' ? styles.viewTabActive : ''}`}
              onClick={() => { setView('register'); setRegError(''); }}
            >
              Create Account
            </button>
          </div>

          {/* ══════════ SIGN IN ══════════ */}
          {view === 'signin' && (
            <form onSubmit={handleSignIn} className={styles.form} autoComplete="on">
              <div className={styles.field}>
                <label htmlFor="si-email" className={styles.label}>Email</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    type="email"
                    id="si-email"
                    value={signInEmail}
                    onChange={e => setSignInEmail(e.target.value)}
                    className={styles.input}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="si-password" className={styles.label}>Password</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    type={showSignInPassword ? 'text' : 'password'}
                    id="si-password"
                    value={signInPassword}
                    onChange={e => setSignInPassword(e.target.value)}
                    className={styles.input}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPassword(v => !v)}
                    className={styles.eyeButton}
                    aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSignInPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {signInError && <p className={styles.error}>{signInError}</p>}
              {isIdleTimeout && <p className={styles.idleNotice}>Your session expired due to inactivity. Please sign in again.</p>}

              <button type="submit" className={styles.button} disabled={signInLoading}>
                {signInLoading ? 'Signing in...' : 'Sign In'}
              </button>

              <p className={styles.footer}>
                Don&apos;t have an account?{' '}
                <span className={styles.link} onClick={() => setView('register')}>
                  Sign up
                </span>
              </p>
            </form>
          )}

          {/* ══════════ REGISTER (3-step) ══════════ */}
          {view === 'register' && (
            <>
              <p className={styles.subtitle}>
                {regStep === 1 && 'Enter your email to get started'}
                {regStep === 2 && 'Check your inbox for a verification code'}
                {regStep === 3 && 'Set your name and password'}
              </p>

              {/* Step indicator */}
              <div className={styles.stepRow} aria-label="Registration progress">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`${styles.stepDot} ${regStep >= s ? styles.stepDotActive : ''} ${regStep === s ? styles.stepDotCurrent : ''}`}>
                    {regStep > s ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      <span>{s}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Step 1: Email */}
              {regStep === 1 && (
            <form onSubmit={handleSendOtp} className={styles.form} autoComplete="on">
              <div className={styles.field}>
                <label htmlFor="reg-email" className={styles.label}>Email Address</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    type="email"
                    id="reg-email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    className={styles.input}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {regError && <p className={styles.error}>{regError}</p>}
              {isIdleTimeout && <p className={styles.idleNotice}>Your session expired due to inactivity. Please sign in again.</p>}

              <button type="submit" className={styles.button} disabled={regLoading}>
                {regLoading ? 'Sending code...' : 'Send Verification Code'}
              </button>

              <p className={styles.footer}>
                Already have an account?{' '}
                <span className={styles.link} onClick={() => setRegStep(1)}>
                  Sign in
                </span>
              </p>
            </form>
          )}

          {/* ─── Step 3: Name + Password (after OTP verified) ─── */}
          {regStep === 3 && (
            <form onSubmit={handleRegister} className={styles.form} autoComplete="on">
              <div className={styles.field}>
                <label htmlFor="reg-name" className={styles.label}>Full Name</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input
                    type="text"
                    id="reg-name"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    className={styles.input}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="reg-password" className={styles.label}>Password</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    id="reg-password"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    className={styles.input}
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                    required
                  />
                  <button type="button" onClick={() => setShowRegPassword(v => !v)} className={styles.eyeButton} aria-label={showRegPassword ? 'Hide password' : 'Show password'}>
                    {showRegPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {regError && <p className={styles.error}>{regError}</p>}

              <button type="submit" className={styles.button} disabled={regLoading}>
                {regLoading ? 'Creating account...' : 'Create Account'}
              </button>

              <p className={styles.footer}>
                Already have an account?{' '}
                <span className={styles.link} onClick={() => setView('signin')}>
                  Sign in
                </span>
              </p>
            </form>
          )}
            </>
          )}
        </div>

        {/* OTP Modal (step 2) */}
        <OtpModal
          email={regEmail}
          isOpen={otpOpen}
          onClose={handleBackToEmail}
          onVerified={handleOtpVerified}
        />
      </div>
    </main>
  );
}