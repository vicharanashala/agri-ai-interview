'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './OtpModal.module.css'

// ── Types ────────────────────────────────────────────────────────────────────

interface OtpModalProps {
  email: string
  isOpen: boolean
  onClose: () => void
  onVerified: () => void   // called when OTP is successfully verified
}

type Step = 'idle' | 'verifying' | 'success' | 'error'

interface VerificationResult {
  step: Step
  message: string
  remainingAttempts?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OtpModal({ email, isOpen, onClose, onVerified }: OtpModalProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [result, setResult] = useState<VerificationResult>({
    step: 'idle',
    message: '',
  })
  const [countdown, setCountdown] = useState(0)
  const [isResending, setIsResending] = useState(false)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Countdown timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(timer)
  }, [isOpen, countdown])

  // ── Auto-focus first input when modal opens ────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '', '', ''])
      setResult({ step: 'idle', message: '' })
      setCountdown(60)
      requestAnimationFrame(() => inputRefs.current[0]?.focus())
    }
  }, [isOpen])

  // ── Auto-submit when all 6 digits are filled ───────────────────────────────

  const otpValue = digits.join('')

  useEffect(() => {
    if (otpValue.length === 6 && result.step !== 'verifying') {
      handleVerify(otpValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue])

  // ── Verify OTP ─────────────────────────────────────────────────────────────

  const handleVerify = useCallback(async (otp: string) => {
    setResult({ step: 'verifying', message: '' })

    try {
      const res = await fetch(`/api/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Extract user-friendly message from backend
        const msg = data.detail ?? data.error ?? 'Verification failed. Please try again.'
        setResult({ step: 'error', message: msg })
        setDigits(['', '', '', '', '', ''])
        requestAnimationFrame(() => inputRefs.current[0]?.focus())
        return
      }

      setResult({ step: 'success', message: data.message ?? 'Email verified successfully!' })
      // Short delay so user sees success state before closing
      setTimeout(() => {
        onVerified()
      }, 1200)
    } catch {
      setResult({ step: 'error', message: 'Network error. Please check your connection and try again.' })
      setDigits(['', '', '', '', '', ''])
      requestAnimationFrame(() => inputRefs.current[0]?.focus())
    }
  }, [email, onVerified, result.step])

  // ── Resend OTP ─────────────────────────────────────────────────────────────

  const handleResend = useCallback(async () => {
    if (isResending || countdown > 0) return
    setIsResending(true)

    try {
      const res = await fetch(`/api/auth/otp/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setResult({
          step: 'error',
          message: data.detail ?? 'Failed to resend. Please try again.',
        })
        setIsResending(false)
        return
      }

      setResult({ step: 'idle', message: data.message ?? 'A new code has been sent.' })
      setDigits(['', '', '', '', '', ''])
      setCountdown(60)
      requestAnimationFrame(() => inputRefs.current[0]?.focus())
    } catch {
      setResult({ step: 'error', message: 'Network error. Please try again.' })
    } finally {
      setIsResending(false)
    }
  }, [email, isResending, countdown])

  // ── Digit input handler ────────────────────────────────────────────────────

  const handleDigitChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1)

    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setResult({ step: 'idle', message: '' })

    // Auto-advance focus
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Jump back on backspace if current field is empty
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return

    const newDigits = [...digits]
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i]
    }
    setDigits(newDigits)
    setResult({ step: 'idle', message: '' })

    // Focus last filled or next empty
    const nextIndex = Math.min(pasted.length, 5)
    requestAnimationFrame(() => inputRefs.current[nextIndex]?.focus())

    // Auto-submit if 6 digits pasted
    if (pasted.length === 6) {
      handleVerify(pasted)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="otp-title">
        {/* Close button */}
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div className={styles.header}>
          {result.step === 'success' ? (
            <div className={styles.successIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : (
            <div className={styles.lockIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
          )}
          <h2 id="otp-title" className={styles.title}>
            {result.step === 'success' ? 'Email Verified!' : 'Verify Your Email'}
          </h2>
          <p className={styles.subtitle}>
            {result.step === 'success'
              ? result.message
              : <>We&apos;ve sent a 6-digit code to<br /><strong>{email}</strong></>
            }
          </p>
        </div>

        {/* Success state — no form needed */}
        {result.step !== 'success' && (
          <>
            {/* OTP digit inputs */}
            <div className={styles.otpRow} onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className={`${styles.otpDigit} ${result.step === 'error' ? styles.otpDigitError : ''}`}
                  disabled={result.step === 'verifying'}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>

            {/* Error message */}
            {result.step === 'error' && result.message && (
              <p className={styles.errorMsg} role="alert">{result.message}</p>
            )}

            {/* Idle info message */}
            {result.step === 'idle' && result.message && (
              <p className={styles.infoMsg}>{result.message}</p>
            )}

            {/* Loading spinner */}
            {result.step === 'verifying' && (
              <div className={styles.verifyingRow}>
                <div className={styles.spinner} />
                <span>Verifying...</span>
              </div>
            )}

            {/* Resend row */}
            <div className={styles.resendRow}>
              {countdown > 0 ? (
                <span className={styles.countdown}>Resend in {formatTime(countdown)}</span>
              ) : (
                <button
                  className={styles.resendBtn}
                  onClick={handleResend}
                  disabled={isResending}
                >
                  {isResending ? 'Sending...' : 'Resend code'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}