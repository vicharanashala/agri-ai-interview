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

    // Fix 1 — Issue 1: Clear "just completed" redirect flags before phase sync so
    // the dashboard's useEffect never sees them and doesn't double-redirect to /summary.
    if (phase >= 3) {
      sessionStorage.removeItem('interviewJustCompleted')
      localStorage.removeItem('interviewJustCompleted')
    }

    // Fix 2 — Issue 2: Always set passedAndVisitedSummary when advancing to phase 3+.
    // This updates the DB immediately so the offer-letter phase (4) unlocks right away,
    // not only after the candidate revisits the dashboard.
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