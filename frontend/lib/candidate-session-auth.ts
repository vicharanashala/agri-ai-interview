/**
 * Server-side helpers for candidate API routes that act on behalf of the
 * signed-in NextAuth user using a backend candidate session token.
 *
 * Kept free of Next.js / path-alias imports so it can be unit tested with
 * `node --test` (see tests/candidate-session-auth.test.mjs).
 */

/**
 * Resolve the candidate session token for a request: the Authorization
 * header (set from sessionStorage by authFetch / interceptAuthFetch) takes
 * precedence over the browser-wide candidate_session cookie. Mirrors the
 * backend's _extract_token: an empty "Bearer " header means no token (it
 * does not fall back to the cookie).
 */
export function extractCandidateToken(
  authorizationHeader: string | null | undefined,
  cookieToken: string | null | undefined
): string | null {
  const auth = authorizationHeader ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7) || null
  return cookieToken || null
}

export type CandidateSessionCheck =
  | { ok: true; candidateId: string; userId: string }
  | { ok: false; reason: 'invalid' | 'mismatch' | 'error' }

/**
 * Validate a backend candidate session token and confirm it belongs to the
 * signed-in NextAuth user (session.user.id === users._id === session user_id).
 *
 *   invalid  — backend rejected the token (expired, superseded or unknown)
 *   mismatch — token is valid but belongs to a different user, or the
 *              signed-in user's id is unknown (fail closed)
 *   error    — backend unreachable or returned an unexpected response
 */
export async function verifyCandidateSessionForUser(
  backendUrl: string | undefined,
  token: string,
  expectedUserId: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<CandidateSessionCheck> {
  let res: Response
  try {
    res = await fetchImpl(`${backendUrl}/api/candidate/session/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return { ok: false, reason: 'error' }
  }

  if (res.status === 401) return { ok: false, reason: 'invalid' }
  if (!res.ok) return { ok: false, reason: 'error' }

  const data = await res.json().catch(() => null)
  const candidateId = data?.candidate_id ? String(data.candidate_id) : ''
  const userId = data?.user_id ? String(data.user_id) : ''
  if (!candidateId || !userId) return { ok: false, reason: 'invalid' }

  if (!expectedUserId || userId !== String(expectedUserId)) {
    return { ok: false, reason: 'mismatch' }
  }

  return { ok: true, candidateId, userId }
}

/** Response body/status for a failed check — never echoes the token. */
export function sessionCheckFailure(
  check: Extract<CandidateSessionCheck, { ok: false }>
): { body: { error: string }; status: number } {
  switch (check.reason) {
    case 'invalid':
      return { body: { error: 'Session expired — please sign in again' }, status: 401 }
    case 'mismatch':
      return { body: { error: 'Session does not match the signed-in account — please sign in again' }, status: 401 }
    default:
      return { body: { error: 'Unable to verify session' }, status: 502 }
  }
}
