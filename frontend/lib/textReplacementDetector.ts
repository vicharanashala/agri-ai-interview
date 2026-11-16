/**
 * Client-side suspicious text-replacement detector.
 *
 * Monitors ordinary typing keystrokes and deletion actions within a rolling
 * time window to flag unusual bulk delete-and-replace patterns (e.g., typing
 * filler text, pausing, then deleting a large amount to transcribe an answer
 * from another device).
 *
 * Important: Treat triggers from this module as a warning signal, not proof of
 * cheating. Thresholds should be calibrated against real sessions to minimize
 * false warnings for candidates who naturally edit their writing.
 */

export interface TextReplacementThresholds {
  /** Rolling time window (ms) over which ordinary keystrokes and deletions are counted. */
  windowMs: number
  /** Minimum number of deleted characters/actions in the window required to trigger. */
  minDeletions: number
  /** Minimum deletion ratio (`deletions / (ordinary + deletions)`) in [0, 1]. */
  minDeletionRatio: number
  /** Minimum time (ms) before another suspicious_text_replacement event can fire. */
  cooldownMs: number
}

export const DEFAULT_TEXT_REPLACEMENT_THRESHOLDS: TextReplacementThresholds = {
  windowMs: 20_000,
  minDeletions: 25,
  minDeletionRatio: 0.4,
  cooldownMs: 15_000,
}

export interface TextReplacementStats {
  ordinaryKeystrokes: number
  deletionActions: number
  totalActions: number
  deletionRatio: number
  windowMs: number
}

export interface TextReplacementTriggerResult extends TextReplacementStats {
  triggeredAt: number
}

export interface InputDeltaContext {
  inputType: string
  isComposing?: boolean
  prevLength: number
  newLength: number
  selectedLength?: number
}

export interface InputEditCounts {
  inserted: number
  deleted: number
}

interface TrackedEvent {
  timestamp: number
  kind: 'insertion' | 'deletion'
  count: number
}

function sanitizeThresholds(
  overrides?: Partial<TextReplacementThresholds>
): TextReplacementThresholds {
  const merged = { ...DEFAULT_TEXT_REPLACEMENT_THRESHOLDS, ...overrides }
  return {
    windowMs: Number.isFinite(merged.windowMs) ? Math.max(1_000, merged.windowMs) : DEFAULT_TEXT_REPLACEMENT_THRESHOLDS.windowMs,
    minDeletions: Number.isFinite(merged.minDeletions) ? Math.max(1, Math.floor(merged.minDeletions)) : DEFAULT_TEXT_REPLACEMENT_THRESHOLDS.minDeletions,
    minDeletionRatio: Number.isFinite(merged.minDeletionRatio)
      ? Math.min(1, Math.max(0, merged.minDeletionRatio))
      : DEFAULT_TEXT_REPLACEMENT_THRESHOLDS.minDeletionRatio,
    cooldownMs: Number.isFinite(merged.cooldownMs) ? Math.max(0, merged.cooldownMs) : DEFAULT_TEXT_REPLACEMENT_THRESHOLDS.cooldownMs,
  }
}

/**
 * Classifies a DOM `input` edit into ordinary inserted characters and deleted
 * characters, accounting for bulk selection overwrites, IME composition,
 * spellcheck replacements, and paste/drop events.
 */
export function classifyInputEdit(ctx: InputDeltaContext): InputEditCounts {
  const inputType = ctx.inputType || ''
  const prevLength = Math.max(0, ctx.prevLength)
  const newLength = Math.max(0, ctx.newLength)
  const selectedLength = Math.min(Math.max(0, ctx.selectedLength ?? 0), prevLength)

  // Never let paste/drop inflate ordinary keystrokes or mask deletions.
  if (
    inputType === 'insertFromPaste' ||
    inputType === 'insertFromPasteAsQuotation' ||
    inputType === 'insertFromDrop'
  ) {
    return { inserted: 0, deleted: 0 }
  }

  // Browser spellcheck / autocorrect substitutions are normal editing assistance.
  if (inputType === 'insertReplacementText') {
    return { inserted: 0, deleted: 0 }
  }

  // IME composition updates (e.g., mobile predictive keyboards or non-Latin scripts)
  // can temporarily shrink character count during glyph conversion without deleting.
  if (inputType === 'deleteCompositionText') {
    return { inserted: 0, deleted: Math.max(0, prevLength - newLength) }
  }
  if (inputType === 'insertCompositionText' || ctx.isComposing) {
    return { inserted: Math.max(0, newLength - prevLength), deleted: 0 }
  }

  if (inputType === 'historyRedo') {
    return { inserted: 0, deleted: 0 }
  }
  if (inputType === 'historyUndo') {
    return { inserted: 0, deleted: Math.max(0, prevLength - newLength) }
  }

  if (inputType.startsWith('delete')) {
    const diff = prevLength - newLength
    const deleted = diff > 0 ? diff : (prevLength > 0 ? 1 : 0)
    return { inserted: 0, deleted }
  }

  if (inputType.startsWith('insert')) {
    if (selectedLength > 0) {
      const remainingBeforeInsert = prevLength - selectedLength
      const inserted = Math.max(1, newLength - remainingBeforeInsert)
      return { inserted, deleted: selectedLength }
    }
    return { inserted: Math.max(1, newLength - prevLength), deleted: 0 }
  }

  // Fallback for synthetic input events where `inputType` is omitted.
  if (newLength > prevLength) {
    return { inserted: newLength - prevLength, deleted: 0 }
  }
  if (prevLength > newLength) {
    return { inserted: 0, deleted: prevLength - newLength }
  }
  return { inserted: 0, deleted: 0 }
}

export class TextReplacementDetector {
  private thresholds: TextReplacementThresholds
  private events: TrackedEvent[]
  private lastTriggerAt: number | null

  constructor(thresholds?: Partial<TextReplacementThresholds>) {
    this.thresholds = sanitizeThresholds(thresholds)
    this.events = []
    this.lastTriggerAt = null
  }

  updateThresholds(thresholds?: Partial<TextReplacementThresholds>): void {
    this.thresholds = sanitizeThresholds(thresholds)
  }

  getThresholds(): TextReplacementThresholds {
    return { ...this.thresholds }
  }

  private prune(now: number): void {
    const cutoff = now - this.thresholds.windowMs
    this.events = this.events.filter((e) => e.timestamp >= cutoff && e.timestamp <= now)
  }

  getStats(now: number = Date.now()): TextReplacementStats {
    this.prune(now)
    let ordinaryKeystrokes = 0
    let deletionActions = 0
    for (const ev of this.events) {
      if (ev.kind === 'insertion') {
        ordinaryKeystrokes += ev.count
      } else {
        deletionActions += ev.count
      }
    }
    const totalActions = ordinaryKeystrokes + deletionActions
    const deletionRatio = totalActions > 0 ? deletionActions / totalActions : 0
    return {
      ordinaryKeystrokes,
      deletionActions,
      totalActions,
      deletionRatio,
      windowMs: this.thresholds.windowMs,
    }
  }

  recordInsertion(count: number = 1, now: number = Date.now()): void {
    if (!Number.isFinite(count) || count < 1) return
    this.prune(now)
    this.events.push({
      timestamp: now,
      kind: 'insertion',
      count: Math.floor(count),
    })
  }

  recordDeletion(
    count: number = 1,
    now: number = Date.now()
  ): TextReplacementTriggerResult | null {
    if (!Number.isFinite(count) || count < 1) return null

    if (
      this.lastTriggerAt !== null &&
      now - this.lastTriggerAt < this.thresholds.cooldownMs
    ) {
      return null
    }

    this.prune(now)
    this.events.push({
      timestamp: now,
      kind: 'deletion',
      count: Math.floor(count),
    })

    const stats = this.getStats(now)
    if (
      stats.deletionActions >= this.thresholds.minDeletions &&
      stats.deletionRatio >= this.thresholds.minDeletionRatio
    ) {
      this.events = []
      this.lastTriggerAt = now
      return {
        ...stats,
        triggeredAt: now,
      }
    }

    return null
  }

  reset(): void {
    this.events = []
    this.lastTriggerAt = null
  }
}
