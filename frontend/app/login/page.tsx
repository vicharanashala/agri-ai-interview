'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const isIdleTimeout = searchParams.get('reason') === 'idle';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        if (!name || !email || !password) {
          setError('Please fill in all fields');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setIsLoading(false);
          return;
        }

        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });

        if (!regRes.ok) {
          const data = await regRes.json();
          if (regRes.status === 409) {
            setError('An account with this email already exists. Please sign in instead.');
            setMode('signin');
          } else {
            setError(data.error || 'Registration failed');
          }
          setIsLoading(false);
          return;
        }

        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Account created but sign-in failed. Please sign in manually.');
          setMode('signin');
          setIsLoading(false);
          return;
        }

        router.push('/post-login');
      } else {
        if (!email || !password) {
          setError('Please fill in all fields');
          setIsLoading(false);
          return;
        }

        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Invalid email or password');
          setIsLoading(false);
          return;
        }

        router.push('/post-login');
      }
    } catch {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
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
          <div className={styles.lockIconHeader}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <h2 className={styles.title}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
          <p className={styles.subtitle}>
            {mode === 'signin' ? 'Access your account to continue' : 'Create an account to continue'}
          </p>

          <form onSubmit={handleSubmit} className={styles.form} autoComplete="on">
            {mode === 'signup' && (
              <div className={styles.field}>
                <label htmlFor="name" className={styles.label}>Full Name</label>
                <div className={styles.inputContainer}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={styles.input}
                    placeholder="Enter your full name"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>Email</label>
              <div className={styles.inputContainer}>
                <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  placeholder="admin@annam.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>Password</label>
              <div className={styles.inputContainer}>
                <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input}
                  placeholder="••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.eyeButton}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            {isIdleTimeout && (
              <p className={styles.idleNotice}>
                Your session expired due to inactivity. Please sign in again.
              </p>
            )}

            <button type="submit" className={styles.button} disabled={isLoading}>
              {isLoading
                ? mode === 'signin' ? 'Signing in...' : 'Creating account...'
                : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className={styles.footer}>
            {mode === 'signin' ? (
              <>Don&apos;t have an account? <span className={styles.link} onClick={() => { setMode('signup'); setError(''); }}>Sign up</span></>
            ) : (
              <>Already have an account? <span className={styles.link} onClick={() => { setMode('signin'); setError(''); }}>Sign in</span></>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}