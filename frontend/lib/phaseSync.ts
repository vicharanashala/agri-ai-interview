/**
 * Sync candidate's current phase + milestone flags to the Prisma database.
 * Call this whenever the candidate advances to a new phase or reaches a milestone.
 *
 * Phase values:
 *   1 = onboarding   → "onboarding"
 *   2 = interview    → "interview"
 *   3 = summary      → "summary"
 *   4 = documents    → "documents"
 *
 * Milestone flags:
 *   passedAndVisitedSummary → user has seen their summary
 *   documentsSubmitted      → user has submitted documents (Phase 4)
 */
export async function syncPhaseToDb(
  phase: number,
  flags?: {
    passedAndVisitedSummary?: boolean
    documentsSubmitted?: boolean
  }
): Promise<void> {
  try {
    const body: Record<string, unknown> = { phase }

    if (phase >= 3) {
      body.passedAndVisitedSummary = true
    }

    if (flags) {
      Object.assign(body, flags)
    }

    await fetch('/api/candidate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[phaseSync] Failed to sync phase to DB:', err)
  }
}