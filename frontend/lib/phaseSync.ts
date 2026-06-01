/**
 * Sync candidate's current phase + milestone flags to the Prisma database.
 * Call this whenever the candidate advances to a new phase or reaches a milestone.
 *
 * Phase values:
 *   1 = onboarding   → "onboarding"
 *   2 = interview    → "interview"
 *   3 = summary      → "summary"
 *   4 = offer        → "offer"
 *   5 = signing      → "signing"
 *   6 = joining      → "joining"
 *
 * Milestone flags (unlock downstream phases):
 *   offerLetterViewed       → user has viewed the offer letter
 *   passedAndVisitedSummary → user has seen their summary
 *   joiningDetailsVisited   → user has visited joining details
 */
export async function syncPhaseToDb(
  phase: number,
  flags?: {
    offerLetterViewed?: boolean
    passedAndVisitedSummary?: boolean
    joiningDetailsVisited?: boolean
  }
): Promise<void> {
  try {
    const body: Record<string, unknown> = { phase }
    if (flags) {
      Object.assign(body, flags)
    }
    await fetch('/api/candidate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[phaseSync] Failed to sync phase to DB:', err)
  }
}