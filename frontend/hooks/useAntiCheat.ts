import { useEffect, useRef, useCallback } from 'react'
import {
  TextReplacementDetector,
  classifyInputEdit,
  type TextReplacementThresholds,
} from '@/lib/textReplacementDetector'

export type ViolationType =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'right_click'
  | 'text_selection'
  | 'multi_monitor'
  | 'idle'
  | 'suspicious_text_replacement'
  | 'rapid_fire_timeout'

export interface ViolationLogDetails {
  message?: string
  metadata?: Record<string, unknown>
}

interface AntiCheatConfig {
  onViolation: (type: ViolationType, count: number) => void
  onTerminate: (type: ViolationType) => void
  onLogEvent?: (type: ViolationType, details?: ViolationLogDetails) => void  // called on every violation — hook doesn't await it
  enabled?: boolean
  idleThresholdMs?: number  // admin-configurable; defaults to 15000
  textReplacementThresholds?: Partial<TextReplacementThresholds>
}

type EditableElement = HTMLTextAreaElement | HTMLInputElement | HTMLElement

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

function isEditableTarget(target: EventTarget | null): target is EditableElement {
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.disabled
  }
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !target.disabled && !NON_TEXT_INPUT_TYPES.has(target.type)
  }
  return target.isContentEditable
}

function getEditableSnapshot(el: EditableElement): { length: number; selectionLength: number } {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const length = el.value.length
    let selectionLength = 0
    try {
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? start
      selectionLength = Math.max(0, end - start)
    } catch {
      selectionLength = 0
    }
    return { length, selectionLength }
  }
  const length = (el.textContent ?? '').length
  const sel = window.getSelection()
  const selectionLength = sel && el.contains(sel.anchorNode) ? sel.toString().length : 0
  return { length, selectionLength }
}

const DEFAULT_IDLE_THRESHOLD_MS = 15_000  // 15 seconds

export function useAntiCheat({
  onViolation,
  onTerminate,
  onLogEvent,
  enabled = true,
  idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS,
  textReplacementThresholds,
}: AntiCheatConfig) {
  const totalViolations = useRef<number>(0)
  const prevScreen = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const lastActivityTime = useRef<number>(Date.now())
  const lastContextMenuTime = useRef<number>(0)
  // Global cooldown to prevent double-fire from browser chaining events (e.g., blur + tab switch)
  const lastViolationTime = useRef<number>(0)
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textReplacementDetectorRef = useRef<TextReplacementDetector>(
    new TextReplacementDetector(textReplacementThresholds)
  )
  const lastLengthMapRef = useRef<WeakMap<EditableElement, number>>(new WeakMap())
  const pendingPreEditRef = useRef<{
    target: EditableElement
    length: number
    selectionLength: number
  } | null>(null)

  const COOLDOWN_MS = 1000

  const trWindowMs = textReplacementThresholds?.windowMs
  const trMinDeletions = textReplacementThresholds?.minDeletions
  const trMinDeletionRatio = textReplacementThresholds?.minDeletionRatio
  const trCooldownMs = textReplacementThresholds?.cooldownMs

  useEffect(() => {
    textReplacementDetectorRef.current.updateThresholds({
      ...(trWindowMs !== undefined ? { windowMs: trWindowMs } : {}),
      ...(trMinDeletions !== undefined ? { minDeletions: trMinDeletions } : {}),
      ...(trMinDeletionRatio !== undefined ? { minDeletionRatio: trMinDeletionRatio } : {}),
      ...(trCooldownMs !== undefined ? { cooldownMs: trCooldownMs } : {}),
    })
  }, [trWindowMs, trMinDeletions, trMinDeletionRatio, trCooldownMs])

  // Only access window/screen after mount (browser-only)
  useEffect(() => {
    prevScreen.current = { x: window.screenX, y: window.screenY }
    lastActivityTime.current = Date.now()
  }, [])

  const checkAndRecord = useCallback(
    (type: ViolationType, details?: ViolationLogDetails) => {
      if (!enabled) return
      const now = Date.now()
      // Ignore if any violation fired within COOLDOWN_MS (browser event chaining)
      if (now - lastViolationTime.current < COOLDOWN_MS) {
        console.log('[AntiCheat] DROPPED (cooldown)', type, 'since last event was', now - lastViolationTime.current, 'ms ago')
        return
      }
      lastViolationTime.current = now
      totalViolations.current += 1
      const count = totalViolations.current
      console.log('[AntiCheat] checkAndRecord', { type, count })
      // Fire-and-forget backend log — don't block the UI
      onLogEvent?.(type, details)
      if (count >= 5) {
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

    // Track ordinary keystrokes and deletion actions in editable fields
    const handleFocusIn = (e: Event) => {
      if (!isEditableTarget(e.target)) return
      lastLengthMapRef.current.set(e.target, getEditableSnapshot(e.target).length)
    }

    const handleEditorKeyDown = (e: Event) => {
      if (!isEditableTarget(e.target)) return
      lastLengthMapRef.current.set(e.target, getEditableSnapshot(e.target).length)
    }

    const handleBeforeInput = (e: Event) => {
      if (!isEditableTarget(e.target)) return
      const snap = getEditableSnapshot(e.target)
      pendingPreEditRef.current = {
        target: e.target,
        length: snap.length,
        selectionLength: snap.selectionLength,
      }
      lastLengthMapRef.current.set(e.target, snap.length)
    }

    const handleInput = (e: Event) => {
      if (!isEditableTarget(e.target)) return
      const inputEvent = e as InputEvent
      const inputType = typeof inputEvent.inputType === 'string' ? inputEvent.inputType : ''
      const newLength = getEditableSnapshot(e.target).length
      const pending = pendingPreEditRef.current?.target === e.target ? pendingPreEditRef.current : null
      pendingPreEditRef.current = null

      const prevLength = pending ? pending.length : (lastLengthMapRef.current.get(e.target) ?? newLength)
      const selectedLength = pending ? pending.selectionLength : 0
      lastLengthMapRef.current.set(e.target, newLength)

      const { inserted, deleted } = classifyInputEdit({
        inputType,
        isComposing: Boolean(inputEvent.isComposing),
        prevLength,
        newLength,
        selectedLength,
      })

      const now = Date.now()
      if (inserted > 0) {
        textReplacementDetectorRef.current.recordInsertion(inserted, now)
      }
      if (deleted > 0) {
        const trigger = textReplacementDetectorRef.current.recordDeletion(deleted, now)
        if (trigger) {
          const ratioPct = Math.round(trigger.deletionRatio * 100)
          const windowSec = Math.round(trigger.windowMs / 1000)
          checkAndRecord('suspicious_text_replacement', {
            message: `${trigger.deletionActions} deletions out of ${trigger.totalActions} key actions (${ratioPct}%) in ${windowSec}s`,
            metadata: {
              ordinaryKeystrokes: trigger.ordinaryKeystrokes,
              deletionActions: trigger.deletionActions,
              totalActions: trigger.totalActions,
              deletionRatio: Number(trigger.deletionRatio.toFixed(3)),
              windowMs: trigger.windowMs,
            },
          })
        }
      }
    }

    const handleSubmit = (e: Event) => {
      pendingPreEditRef.current = null
      if (e.target instanceof HTMLFormElement) {
        e.target.querySelectorAll('textarea, input').forEach((field) => {
          if (isEditableTarget(field)) {
            lastLengthMapRef.current.delete(field)
          }
        })
      }
    }

    // Attach all handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      document.addEventListener(event, handler)
    })
    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('keydown', handleEditorKeyDown, true)
    document.addEventListener('beforeinput', handleBeforeInput, true)
    document.addEventListener('input', handleInput, true)
    document.addEventListener('submit', handleSubmit, true)

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, recordActivity)
      })
      Object.entries(handlers).forEach(([event, handler]) => {
        document.removeEventListener(event, handler)
      })
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('keydown', handleEditorKeyDown, true)
      document.removeEventListener('beforeinput', handleBeforeInput, true)
      document.removeEventListener('input', handleInput, true)
      document.removeEventListener('submit', handleSubmit, true)
      clearInterval(pollScreen)
      if (idleTimerRef.current) clearInterval(idleTimerRef.current)
      pendingPreEditRef.current = null
      textReplacementDetectorRef.current.reset()
    }
  }, [enabled, checkAndRecord, recordActivity, idleThresholdMs])

  const reset = useCallback(() => {
    totalViolations.current = 0
    lastActivityTime.current = Date.now()
    pendingPreEditRef.current = null
    lastLengthMapRef.current = new WeakMap()
    textReplacementDetectorRef.current.reset()
  }, [])

  return { reset, recordViolation: checkAndRecord }
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
  idle: 'No activity detected for 10 seconds. Please stay active.',
  suspicious_text_replacement:
    'Unusual rapid deletion and replacement of text was detected. Please write your answers directly without clearing large blocks of text.',
  rapid_fire_timeout:
    'Five rapid-fire questions have expired without an answer. Please select an option promptly before the 30-second timer runs out.',
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
  idle: 'Idle Warning',
  suspicious_text_replacement: 'Suspicious Text Replacement',
  rapid_fire_timeout: 'Rapid-Fire Timeout Warning',
}