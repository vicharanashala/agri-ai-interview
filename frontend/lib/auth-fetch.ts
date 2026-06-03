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
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })
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

  window.fetch = async (url: string | Request, init?: RequestInit) => {
    const token = getAuthToken()
    if (token) {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string> || {}),
        Authorization: `Bearer ${token}`,
      }
      init = { ...init, headers }
    }
    return orig(url, init)
  }

  _restore = () => {
    window.fetch = orig
    _restore = null
  }

  return _restore
}