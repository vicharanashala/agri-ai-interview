'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import Image from 'next/image';

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

  // ── Email verification ────────────────────────────
  const [emailVerified, setEmailVerified] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isIdleTimeout = searchParams.get('reason') === 'idle';

  // ── Resend cooldown ticker ─────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // ── Email verification ─────────────────────────────
  const handleVerifyClick = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address first.');
      return;
    }
    setError('');
    setOtpError('');
    setOtpValues(['', '', '', '', '', '']);
    setShowOtpModal(true);
    setResendCooldown(0);

    // Fire and forget — modal is already open, user can retry if needed
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: mode === 'signup' ? name : '' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Failed to send OTP. Please try again.');
        setResendCooldown(5);
      } else {
        setResendCooldown(30);
      }
    } catch {
      setOtpError('Network error. Please check your connection and try again.');
      setResendCooldown(5);
    }
  };

  // OTP digit input — auto-advances focus, handles paste & backspace
  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otpValues];
    next[idx] = val;
    setOtpValues(next);
    setOtpError('');
    if (val && idx < 5) {
      const nextInput = document.getElementById(`otp-${idx + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValues[idx] && idx > 0) {
      const prev = document.getElementById(`otp-${idx - 1}`);
      prev?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...otpValues];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] || '';
    setOtpValues(next);
    const lastFilled = Math.min(pasted.length, 5);
    document.getElementById(`otp-${lastFilled}`)?.focus();
  };

  const handleOtpResend = async () => {
    if (resendCooldown > 0) return;
    setOtpError('');
    setOtpValues(['', '', '', '', '', '']);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: mode === 'signup' ? name : '' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Failed to resend OTP. Please try again.');
        setResendCooldown(5);
      } else {
        setResendCooldown(30);
      }
    } catch {
      setOtpError('Network error. Please try again.');
      setResendCooldown(5);
    }
  };

  const handleOtpVerify = async () => {
    const otp = otpValues.join('');
    if (otp.length < 6) {
      setOtpError('Please enter all 6 digits.');
      return;
    }
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Invalid or expired OTP.');
        setOtpValues(['', '', '', '', '', '']);
        document.getElementById('otp-0')?.focus();
      } else {
        setShowOtpModal(false);
        setEmailVerified(true);
        setOtpValues(['', '', '', '', '', '']);
      }
    } catch {
      setOtpError('Network error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!emailVerified) {
        setError('Please verify your email first.');
        setIsLoading(false);
        return;
      }

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
           <img src="/annam-logo.png" alt="ANNAM.AI" className={styles.logo} />
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
            <span className={styles.checkIcon}>✓</span> Developed at IIT Ropar
          </span>
          <span className={styles.bulletDivider}>|</span>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> Adaptive AI Interviews
          </span>
          <span className={styles.bulletDivider}>|</span>
          <span className={styles.bulletItem}>
            <span className={styles.checkIcon}>✓</span> Secure & Fair Evaluation
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
              <div className={styles.emailInputRow}>
                <div className={`${styles.inputContainer} ${styles.emailInputContainer}`}>
                  <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      // Reset verification if email changes
                      setEmailVerified(false);
                    }}
                    className={styles.input}
                    placeholder="admin@annam.com"
                    autoComplete="email"
                  />
                </div>

                {emailVerified ? (
                  <div className={styles.verifiedBadge} title="Email verified">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Verified
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleVerifyClick}
                    className={styles.verifyBtn}
                    disabled={!email || !email.includes('@')}
                  >
                    Verify
                  </button>
                )}
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
                  className={`${styles.input} ${!emailVerified ? styles.inputDisabled : ''}`}
                  placeholder={emailVerified ? '••••••••' : 'Verify email first'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  disabled={!emailVerified}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.eyeButton}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={!emailVerified}
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

            <button type="submit" className={styles.button} disabled={isLoading || !emailVerified}>
              {isLoading
                ? mode === 'signin' ? 'Signing in...' : 'Creating account...'
                : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className={styles.footer}>
            {mode === 'signin' ? (
              <>Don't have an account? <span className={styles.link} onClick={() => { setMode('signup'); setError(''); setEmailVerified(false); }}>Sign up</span></>
            ) : (
              <>Already have an account? <span className={styles.link} onClick={() => { setMode('signin'); setError(''); setEmailVerified(false); }}>Sign in</span></>
            )}
          </p>
        </div>

        {/* OTP Verification Modal */}
        {showOtpModal && (
          <div className={styles.otpOverlay}>
            <div className={styles.otpModal}>
              <button
                className={styles.otpCloseBtn}
                onClick={() => setShowOtpModal(false)}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>

              <div className={styles.otpIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>

              <h3 className={styles.otpTitle}>Verify your email</h3>
              <p className={styles.otpSubtitle}>
                Enter the 6-digit code sent to<br/>
                <strong>{email}</strong>
              </p>

              <div className={styles.otpInputsRow}>
                {otpValues.map((val, idx) => (
                  <input
                    key={idx}
                    id={`otp-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={val}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={handleOtpPaste}
                    className={styles.otpInput}
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              {otpError && <p className={styles.otpError}>{otpError}</p>}

              <button
                type="button"
                onClick={handleOtpVerify}
                className={styles.otpVerifyBtn}
                disabled={otpLoading}
              >
                {otpLoading ? 'Verifying…' : 'Verify & Continue'}
              </button>

              <div className={styles.otpResendRow}>
                {resendCooldown > 0 ? (
                  <span className={styles.resendTimer}>
                    Resend in {resendCooldown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleOtpResend}
                    className={styles.resendBtn}
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}