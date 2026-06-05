'use client'

import { useEffect, useRef, useState } from 'react'
import type { ViolationType } from '@/hooks/useAntiCheat'
import { VIOLATION_LABELS, VIOLATION_TITLES } from '@/hooks/useAntiCheat'
import styles from './AntiCheatOverlay.module.css'

interface AntiCheatOverlayProps {
  isVisible: boolean
  violationType: ViolationType | null
  offenseCount: number
  onDismiss: () => void
}

const AUTO_CLOSE_SECONDS = 15

export default function AntiCheatOverlay({
  isVisible,
  violationType,
  offenseCount,
  onDismiss,
}: AntiCheatOverlayProps) {
  const exitAnimation = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS)

  useEffect(() => {
    if (!isVisible) return

    setCountdown(AUTO_CLOSE_SECONDS)

    const tick = () => {
      setCountdown(prev => {
        if (prev <= 1) return 0
        return prev - 1
      })
    }

    const id = setInterval(tick, 1000)
    timerRef.current = id

    // Auto-dismiss after 15 seconds
    const timeout = setTimeout(() => {
      exitAnimation.current = true
      onDismiss()
    }, AUTO_CLOSE_SECONDS * 1000)

    return () => {
      clearInterval(id)
      clearTimeout(timeout)
    }
  }, [isVisible, onDismiss])

  const handleDone = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    exitAnimation.current = true
    setTimeout(() => {
      exitAnimation.current = false
      onDismiss()
    }, 400)
  }

  if (!isVisible) return null

  const title = violationType ? VIOLATION_TITLES[violationType] : 'Violation'
  const message = violationType ? VIOLATION_LABELS[violationType] : ''

  return (
    <div className={`${styles.overlay} ${exitAnimation.current ? styles.fadeOut : styles.fadeIn}`}>
      <div className={styles.card}>
        <div className={styles.icon}>⚠️</div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.offense}>
          <span className={styles.dot} />
          Warning {offenseCount} of 2
        </div>
        <p className={styles.hint}>If you do this again, the interview will end automatically.</p>
        <button className={styles.okayButton} onClick={handleDone}>
          Done
        </button>
        <p className={styles.autoCloseHint}>
          Auto-closing in <strong>{countdown}s</strong>
        </p>
      </div>
    </div>
  )
}