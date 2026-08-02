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

        // Always go through /post-login to create the backend session token
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

        // Always go through /post-login — it handles session creation AND routing
        router.push('/post-login');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      {/* Left panel: Info & Branding */}
      <div className={styles.leftPane}>
        <div className={styles.leftContent}>
          <header className={styles.topBar}>
            <div className={styles.logo} aria-label="ANNAM.AI" />
            <p className={styles.brandSub}>Center of Excellence for AI in Agriculture, IIT Ropar</p>
          </header>

          <div className={styles.hero}>
            <h1 className={styles.heading}>
              Welcome to<br />
              <span className={styles.anveshanText}>ANVESHAN</span>
            </h1>
            <p className={styles.description}>
              <span className={styles.descHighlight}>AI-Powered Agricultural Interview Platform</span><br />
              Evaluating talent with intelligent, adaptive interviews<br />
              designed for the future of agriculture.
            </p>
          </div>

          {/* FAQs Hero Card */}
          <div className={styles.faqCard} onClick={() => router.push('/faq')}>
            <div className={styles.faqIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className={styles.faqContent}>
              <h2 className={styles.faqTitle}>FAQs</h2>
              <p className={styles.faqDesc}>
                Get instant answers about<br />
                internships, interview process,<br />
                required documents, eligibility<br />
                criteria, and more — before you even<br />
                sign up.
              </p>
            </div>
            <div className={styles.faqArrow}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
          </div>
        </div>

        <div className={styles.footerBullets}>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> Powered by IIT Ropar
          </span>
          <span className={styles.bulletDivider}>|</span>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> Secure Authentication
          </span>
          <span className={styles.bulletDivider}>|</span>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> AI-Powered Evaluation
          </span>
        </div>
      </div>

      {/* Right panel: Login box */}
      <div className={styles.rightPane}>
        <div className={styles.loginBox}>
          {/* Outlined lock icon header */}
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
              <>Don't have an account? <span className={styles.link} onClick={() => { setMode('signup'); setError(''); }}>Sign up</span></>
            ) : (
              <>Already have an account? <span className={styles.link} onClick={() => { setMode('signin'); setError(''); }}>Sign in</span></>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}