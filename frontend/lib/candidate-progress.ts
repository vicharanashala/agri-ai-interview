/**
 * Candidate progress flags.
 *
 * The candidate record from GET /api/candidate is the source of truth for
 * course/module completion. localStorage is shared by every account that
 * uses the browser and survives logout, so it is only ever a mirror of the
 * DB — never an input that can advance progress.
 *
 * Kept free of Next.js / path-alias imports so it can be unit tested with
 * `node --test` (see tests/candidate-progress.test.mjs).
 */

export const FOUNDATION_COMPLETED_KEY = 'foundationCourseCompleted'
export const MODULE_COMPLETED_KEY = 'moduleCompleted'

export interface CompletionFlags {
  foundationCourseCompleted: boolean
  moduleCompleted: boolean
}

type CandidateLike = {
  foundationCourseCompleted?: unknown
  moduleCompleted?: unknown
} | null | undefined

/** Completion flags exactly as the DB reports them. */
export function completionFromCandidate(candidate: CandidateLike): CompletionFlags {
  return {
    foundationCourseCompleted: Boolean(candidate?.foundationCourseCompleted),
    moduleCompleted: Boolean(candidate?.moduleCompleted),
  }
}

/**
 * Read completion flags from the candidate record (GET /api/candidate).
 * Returns null when the record cannot be loaded, so callers can fall back.
 */
export async function fetchCompletionFlags(
  fetchImpl: typeof fetch = fetch
): Promise<CompletionFlags | null> {
  try {
    const res = await fetchImpl('/api/candidate', { cache: 'no-store' })
    if (!res.ok) return null
    const candidate = await res.json()
    return candidate ? completionFromCandidate(candidate) : null
  } catch {
    return null
  }
}

/** Mirror DB completion into localStorage: set when complete, remove when not. */
export function syncCompletionStorage(
  flags: CompletionFlags,
  storage: Pick<Storage, 'setItem' | 'removeItem'>
): void {
  if (flags.foundationCourseCompleted) storage.setItem(FOUNDATION_COMPLETED_KEY, 'completed')
  else storage.removeItem(FOUNDATION_COMPLETED_KEY)

  if (flags.moduleCompleted) storage.setItem(MODULE_COMPLETED_KEY, 'completed')
  else storage.removeItem(MODULE_COMPLETED_KEY)
}

/**
 * Dashboard phase: the DB phase, advanced only by DB milestone flags.
 *   foundation completed → at least 5 (Ground Truth Module)
 *   module completed / documents submitted → 6 (Upload Documents)
 */
export function resolveDashboardPhase(
  dbPhaseNum: number,
  flags: CompletionFlags & { documentsSubmitted: boolean }
): number {
  let phase = dbPhaseNum
  if (flags.foundationCourseCompleted && phase < 5) phase = 5
  if (flags.moduleCompleted && phase < 6) phase = 6
  if (flags.documentsSubmitted && phase < 6) phase = 6
  return phase
}
