/**
 * Client-side candidate backend-session helpers used by /post-login and logout.
 *
 * Dependencies are injected so the logic can be unit tested with
 * `node --test` (see tests/candidate-session-client.test.mjs).
 * Never log token values from here.
 */

export interface CandidateSessionDeps {
  /** Token stored in this tab (sessionStorage), if any. */
  getStoredToken(): string | null
  /** Persist the token for this tab along with the candidate it belongs to. */
  storeSession(token: string, candidateId: string): void
  /** Remove any stored token / candidate id for this tab. */
  clearStoredSession(): void
  /** Ask the backend which candidate a token belongs to; null if invalid or unverifiable. */
  verifyToken(token: string): Promise<{ candidateId: string } | null>
  /** Create a new backend session; returns the new token or null on failure. */
  createSession(candidateId: string, email: string): Promise<string | null>
}

export type EnsureSessionOutcome = 'reused' | 'created' | 'failed'

// One in-flight session setup per candidate. Repeated effect runs (React
// StrictMode, NextAuth session refetch on focus) join the pending promise
// instead of creating a second session, which would invalidate the first
// under the backend's single-session policy.
const inflight = new Map<string, Promise<EnsureSessionOutcome>>()

/**
 * Make sure this tab holds a valid backend session token for `candidateId`.
 * A stored token is reused only when the backend confirms it belongs to this
 * candidate; otherwise it is discarded and a fresh session is created.
 */
export function ensureCandidateSession(
  candidateId: string,
  email: string,
  deps: CandidateSessionDeps
): Promise<EnsureSessionOutcome> {
  const key = `${candidateId}|${email.trim().toLowerCase()}`
  const pending = inflight.get(key)
  if (pending) return pending

  const run = (async (): Promise<EnsureSessionOutcome> => {
    const existing = deps.getStoredToken()
    if (existing) {
      let owner: { candidateId: string } | null = null
      try {
        owner = await deps.verifyToken(existing)
      } catch {
        owner = null
      }
      if (owner && owner.candidateId === candidateId) {
        deps.storeSession(existing, candidateId)
        return 'reused'
      }
      // Invalid, unverifiable, or another candidate's token — never reuse it.
      deps.clearStoredSession()
    }

    let token: string | null = null
    try {
      token = await deps.createSession(candidateId, email)
    } catch {
      token = null
    }
    if (!token) return 'failed'
    deps.storeSession(token, candidateId)
    return 'created'
  })()

  inflight.set(key, run)
  run.finally(() => inflight.delete(key)).catch(() => {})
  return run
}

/**
 * Best-effort backend logout for the given token. Resolves once the request
 * completes, fails, or times out — never throws, never logs the token.
 */
export async function endCandidateBackendSession(
  backendUrl: string | undefined,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000
): Promise<void> {
  if (!backendUrl || !token) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetchImpl(`${backendUrl}/api/candidate/session/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
  } catch {
    // best-effort: local state is cleared by the caller regardless
  } finally {
    clearTimeout(timer)
  }
}
