/**
 * Sync candidate's current phase to the Prisma database.
 * Call this whenever the candidate advances to a new phase.
 *
 * Phase values:
 *   1 = onboarding   → "onboarding"
 *   2 = interview    → "interview"
 *   3 = summary      → "summary"
 *   4 = offer        → "offer"
 *   5 = signing      → "signing"
 *   6 = joining      → "joining"
 */
export async function syncPhaseToDb(phase: number): Promise<void> {
  try {
    await fetch('/api/candidate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase }),
    });
  } catch (err) {
    console.error('[phaseSync] Failed to sync phase to DB:', err);
  }
}