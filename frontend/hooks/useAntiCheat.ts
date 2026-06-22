import { useEffect, useRef, useCallback } from 'react'

export type ViolationType =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'right_click'
  | 'text_selection'
  | 'multi_monitor'
  | 'split_screen'
  | 'idle'

interface AntiCheatConfig {
  onViolation: (type: ViolationType, count: number) => void
  onTerminate: (type: ViolationType) => void
  onLogEvent?: (type: ViolationType) => void  // called on every violation — hook doesn't await it
  enabled?: boolean
  idleThresholdMs?: number  // admin-configurable; defaults to 15000
}

interface OffenseCount {
  [key: string]: number
}

const DEFAULT_IDLE_THRESHOLD_MS = 15_000  // 15 seconds

export function useAntiCheat({ onViolation, onTerminate, onLogEvent, enabled = true, idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS }: AntiCheatConfig) {
  const offenseCount = useRef<OffenseCount>({})
  const prevScreen = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Tracks the maximum total display width seen — persists across effect re-runs.
  // screen.width is the total monitor width and never changes due to window tiling,
  // dock, or menu bar. It stays at the true display width (e.g. 1440) even when
  // the browser is in split-screen, unlike screen.availWidth which halves on split.
  const maxScreenWidth = useRef<number>(0)
  const lastActivityTime = useRef<number>(Date.now())
  const lastContextMenuTime = useRef<number>(0)
  // Per-type cooldown to prevent double-fire from browser chaining events
  const lastViolationTime = useRef<Record<string, number>>({})
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const COOLDOWN_MS = 500

  // Only access window/screen after mount (browser-only)
  // Initializes maxScreenWidth on mount so it's available before the interview effect runs.
  useEffect(() => {
    prevScreen.current = { x: window.screenX, y: window.screenY }
    maxScreenWidth.current = screen.width
    lastActivityTime.current = Date.now()
  }, [])

  const checkAndRecord = useCallback(
    (type: ViolationType) => {
      if (!enabled) return
      const now = Date.now()
      // Ignore if same type fired within COOLDOWN_MS (browser event chaining)
      if (lastViolationTime.current[type] && now - lastViolationTime.current[type] < COOLDOWN_MS) {
        console.log('[AntiCheat] DROPPED (cooldown)', type, 'since last event was', now - lastViolationTime.current[type], 'ms ago')
        return
      }
      lastViolationTime.current[type] = now
      offenseCount.current[type] = (offenseCount.current[type] || 0) + 1
      const count = offenseCount.current[type]
      console.log('[AntiCheat] checkAndRecord', { type, count, allCounts: { ...offenseCount.current } })
      // Fire-and-forget backend log — don't block the UI
      onLogEvent?.(type)
      if (count >= 2) {
        console.log('[AntiCheat] TERMINATE triggered for', type)
        onTerminate(type)
      } else {
        console.log('[AntiCheat] VIOLATION warning for', type, 'count:', count)
        onViolation(type, count)
      }
    },
    [enabled, onViolation, onTerminate, onLogEvent]
  )

  // Track user activity (mouse, key, scroll, touch)
  const recordActivity = useCallback(() => {
    lastActivityTime.current = Date.now()
  }, [])

  useEffect(() => {
    if (!enabled) return

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    activityEvents.forEach(event => {
      document.addEventListener(event, recordActivity, { passive: true })
    })

    // Idle detection — check every 5 seconds
    idleTimerRef.current = setInterval(() => {
      if (Date.now() - lastActivityTime.current >= idleThresholdMs) {
        checkAndRecord('idle')
      }
    }, 5_000)

    // Multi-monitor detection — poll screen position every 2 seconds
    const pollScreen = setInterval(() => {
      if (
        window.screenX !== prevScreen.current.x ||
        window.screenY !== prevScreen.current.y
      ) {
        prevScreen.current = { x: window.screenX, y: window.screenY }
        checkAndRecord('multi_monitor')
      }
    }, 2_000)

    // Split-screen detection — poll every 2 seconds.
    // Detects split-screen by comparing viewport width to the total display width (screen.width).
    // screen.width is the physical monitor width and stays at full value regardless of window tiling,
    // dock, or menu bar — making it the correct reference for detecting when the browser has been
    // squeezed into a narrower portion of the screen.
    // Also track maxScreenWidth across polls so we pick up any wider display baselines.
    const splitScreenTimer = setInterval(() => {
      // Update baseline if this poll saw a wider screen
      if (screen.width > maxScreenWidth.current) {
        maxScreenWidth.current = screen.width
      }
      // Trigger if the viewport occupies less than 60% of the total screen width
      if (maxScreenWidth.current > 0 && window.innerWidth < maxScreenWidth.current * 0.6) {
        checkAndRecord('split_screen')
      }
    }, 2_000)

    const handlers: Record<string, EventListener> = {
      // Tab became hidden (tab switch or minimize)
      visibilitychange: () => {
        if (document.hidden) {
          checkAndRecord('tab_switch')
        }
      },

      // Window lost focus (Alt+Tab, click outside, etc.)
      blur: () => {
        checkAndRecord('window_blur')
      },

      // Fullscreen exit
      fullscreenchange: () => {
        if (!document.fullscreenElement) {
          checkAndRecord('fullscreen_exit')
        }
      },

      // Copy attempt
      copy: (e) => {
        e.preventDefault()
        checkAndRecord('copy_attempt')
      },

      // Paste attempt
      paste: (e) => {
        e.preventDefault()
        checkAndRecord('paste_attempt')
      },

      // Right-click
      contextmenu: (e) => {
        e.preventDefault()
        lastContextMenuTime.current = Date.now()
        checkAndRecord('right_click')
      },
    }

    // Text selection — listen on mouseup
    // Skip if a contextmenu just fired (right-click dismissal click shouldn't count as fresh selection)
    const handleSelection = () => {
      if (Date.now() - lastContextMenuTime.current < 200) return
      const selection = window.getSelection()
      if (selection && selection.toString().trim().length > 0) {
        checkAndRecord('text_selection')
      }
    }

    // Attach all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      document.addEventListener(event, handler)
    })
    document.addEventListener('mouseup', handleSelection)

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, recordActivity)
      })
      Object.entries(handlers).forEach(([event, handler]) => {
        document.removeEventListener(event, handler)
      })
      document.removeEventListener('mouseup', handleSelection)
      clearInterval(pollScreen)
      clearInterval(splitScreenTimer)
      if (idleTimerRef.current) clearInterval(idleTimerRef.current)
    }
  }, [enabled, checkAndRecord, recordActivity])

  const reset = useCallback(() => {
    offenseCount.current = {}
    lastActivityTime.current = Date.now()
  }, [])

  return { reset }
}

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  tab_switch: 'Switching tabs is not permitted during the interview.',
  window_blur: 'Leaving the interview window is not permitted.',
  fullscreen_exit: 'Exiting fullscreen mode is not permitted during the interview.',
  copy_attempt: 'Copying content is not permitted.',
  paste_attempt: 'Pasting content is not permitted.',
  right_click: 'Right-click is disabled during the interview.',
  text_selection: 'Selecting text is not permitted during the interview.',
  multi_monitor: 'Moving to another display is not permitted during the interview.',
  split_screen: 'Split-screen or small window detected. Please use a full-size window.',
  idle: 'No activity detected for 10 seconds. Please stay active.',
}

export const VIOLATION_TITLES: Record<ViolationType, string> = {
  tab_switch: 'Tab Switch Detected',
  window_blur: 'Window Focus Lost',
  fullscreen_exit: 'Fullscreen Exited',
  copy_attempt: 'Copy Blocked',
  paste_attempt: 'Paste Blocked',
  right_click: 'Right-Click Blocked',
  text_selection: 'Text Selection Blocked',
  multi_monitor: 'Multi-Monitor Detected',
  split_screen: 'Split-Screen Detected',
  idle: 'Idle Warning',
}