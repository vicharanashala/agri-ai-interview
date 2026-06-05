/**
 * Authenticated fetch for candidate API calls.
 * Automatically attaches:
 *   - Authorization: Bearer <token> from sessionStorage['candidate_session_token']
 *   - credentials: 'include' for cookie passthrough
 *
 * Usage: import { authFetch } from '@/lib/auth-fetch'
 *        await authFetch('/api/interview/message', { method: 'POST', body: ... })
 *
 * Or use interceptAuthFetch() to monkey-patch ALL window.fetch calls at once:
 *   import { interceptAuthFetch } from '@/lib/auth-fetch'
 *   const restore = interceptAuthFetch()  // call once on page mount
 *   // All fetch calls now auto-attach Authorization header
 *   // on cleanup: restore()
 */
const TOKEN_KEY = 'candidate_session_token'

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(TOKEN_KEY, token)
  }
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem('candidate_id')
  }
}

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken()

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    console.log(`[authFetch] URL=${url} | token(first 8)=${token.substring(0, 8)}... | header set`);
  } else {
    console.warn(`[authFetch] URL=${url} | NO TOKEN in sessionStorage — no Authorization header`);
    console.warn(`[authFetch] sessionStorage keys:`, Object.keys(sessionStorage));
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })

  // Single-device enforcement: if backend returns 401, the session was invalidated
  // (kicked by another device). Clear local session state and redirect to login.
  if (response.status === 401) {
    console.warn('[authFetch] 401 received — session invalidated (device kicked). Redirecting to login.');
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      // Preserve interviewInProgress flag so we can resume after re-login
      const wasInInterview = sessionStorage.getItem('interviewInProgress') === 'true';
      window.sessionStorage.clear();
      if (wasInInterview) sessionStorage.setItem('interviewInProgress', 'true');
      window.location.href = '/login';
    }
    // Return an invalid Response so callers that await this don't proceed
    return new Response(null, { status: 401 });
  }

  return response
}

// ─── Singleton fetch interceptor ─────────────────────────────────────────────

// Module-level singleton — only ever applied once per page session
let _restore: (() => void) | null = null

/**
 * Intercept ALL window.fetch calls so that every API request automatically
 * includes the Authorization header if a token is present in sessionStorage.
 *
 * Safe to call multiple times (only the first call applies; subsequent calls
 * return the same restore function). Call the restore function to undo.
 */
export function interceptAuthFetch(): () => void {
  if (_restore) return _restore

  const orig = window.fetch.bind(window)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window.fetch as any) = async (url: Parameters<typeof orig>[0], init?: RequestInit | undefined) => {
    const token = getAuthToken()
    const urlStr = typeof url === 'string' ? url : (url as Request).url
    if (token) {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string> || {}),
        Authorization: `Bearer ${token}`,
      }
      init = { ...init, headers }
      console.log(`[interceptFetch] URL=${urlStr} | token(first 8)=${token.substring(0, 8)}... | header attached`);
    } else {
      console.warn(`[interceptFetch] URL=${urlStr} | NO TOKEN in sessionStorage — request will go without auth`);
    }
    const response = await orig(url, init)

    // Single-device enforcement: if backend returns 401, the session was invalidated
    // (kicked by another device). Clear local session state and redirect to login.
    if (response.status === 401) {
      console.warn('[interceptFetch] 401 received — session invalidated. Redirecting to login.');
      if (typeof window !== 'undefined') {
        const wasInInterview = window.sessionStorage.getItem('interviewInProgress') === 'true'
        window.sessionStorage.clear()
        if (wasInInterview) window.sessionStorage.setItem('interviewInProgress', 'true')
        window.location.href = '/login'
      }
      return new Response(null, { status: 401 })
    }

    return response
  }

  _restore = () => {
    window.fetch = orig
    _restore = null
  }

  return _restore
}