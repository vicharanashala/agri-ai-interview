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
      {/* Top bar with small logo */}
      <header className={styles.topBar}>
        <img
          src="/login/annam-logo-white.png"
          alt="ANNAM.AI"
          className={styles.logo}
        />
        <p className={styles.brandSub}>Center of Excellence for AI in Agriculture, IIT Ropar</p>
      </header>

      {/* Hero heading */}
      <div className={styles.hero}>
        <h1 className={styles.heading}>
          Welcome to Anveshan<br />
          <span className={styles.subHeading}>AI-Powered Agri Interview Platform</span>
        </h1>
      </div>

      {/* FAQ Hero Card */}
      <div className={styles.faqCard} onClick={() => router.push('/faq')}>
        <div className={styles.faqIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div className={styles.faqContent}>
          <h2 className={styles.faqTitle}>FAQs</h2>
          <p className={styles.faqDesc}>
            Get instant answers about internships, interview process, required documents,
            eligibility criteria, and more — before you even sign up.
          </p>
        </div>
        <div className={styles.faqArrow}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </div>
      </div>

      {/* Login form */}
      <div className={styles.loginBox}>
        <h2 className={styles.title}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>

        <form onSubmit={handleSubmit} className={styles.form} autoComplete="on">
          {mode === 'signup' && (
            <div className={styles.field}>
              <label htmlFor="name" className={styles.label}>Full Name</label>
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
          )}

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="Enter your email"
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
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
    </main>
  );
}