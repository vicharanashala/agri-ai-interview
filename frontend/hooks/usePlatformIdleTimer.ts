/**
 * usePlatformIdleTimer
 *
 * Tracks candidate activity across the platform (all pages).
 * If no activity for `idleMs`, forces re-login.
 * Reads the idle threshold from anti-cheat settings on the backend.
 */
import { useEffect, useRef } from 'react'

const LAST_ACTIVITY_KEY = 'platform_last_activity_at'
const SETTINGS_CACHE_KEY = 'platform_idle_settings_cache'
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const

interface AntiCheatSettings {
  idle_threshold_ms: number
  platform_idle_ms: number
}

function getCachedSettings(): AntiCheatSettings | null {
  try {
    const raw = sessionStorage.getItem(SETTINGS_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { data: AntiCheatSettings; ts: number }
    if (Date.now() - cached.ts > SETTINGS_CACHE_TTL_MS) {
      sessionStorage.removeItem(SETTINGS_CACHE_KEY)
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

function setCachedSettings(settings: AntiCheatSettings) {
  try {
    sessionStorage.setItem(
      SETTINGS_CACHE_KEY,
      JSON.stringify({ data: settings, ts: Date.now() })
    )
  } catch {
    // ignore
  }
}

function recordActivity() {
  try {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function usePlatformIdleTimer({ enabled = true }: { enabled?: boolean } = {}) {
  const logoutFnRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Record initial activity
    recordActivity()

    // Attach activity listeners
    ACTIVITY_EVENTS.forEach(event => {
      document.addEventListener(event, recordActivity, { passive: true })
    })

    let checkInterval: ReturnType<typeof setInterval> | null = null

    async function checkIdle() {
      // Try to get cached settings first
      let settings = getCachedSettings()

      // If no cache, fetch from settings endpoint
      if (!settings) {
        try {
          const res = await fetch('/api/settings/anti-cheat')
          if (res.ok) {
            settings = await res.json()
            if (settings) setCachedSettings(settings)
          }
        } catch {
          // use defaults if fetch fails
        }
      }

      const platformIdleMs = settings?.platform_idle_ms ?? 15 * 60 * 1000

      try {
        const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY)
        if (!lastActivity) return

        const idleMs = Date.now() - parseInt(lastActivity, 10)
        if (idleMs >= platformIdleMs) {
          // Idle threshold exceeded — force re-login
          clearInterval(checkInterval!)

          // Call logout endpoint (clear server-side session)
          const backendUrl = process.env.NEXT_PUBLIC_API_URL
          try {
            await fetch(`${backendUrl}/api/candidate/session/logout`, {
              method: 'POST',
              credentials: 'include',
            })
          } catch {
            // best-effort
          }

          // Clear client-side tokens
          try {
            sessionStorage.removeItem(LAST_ACTIVITY_KEY)
            localStorage.removeItem('candidate_token')
            localStorage.removeItem('candidate_email')
            localStorage.removeItem('candidate_id')
            sessionStorage.removeItem(SETTINGS_CACHE_KEY)
          } catch {
            // ignore
          }

          // Redirect to login with idle reason
          window.location.href = '/login?reason=idle'
        }
      } catch {
        // ignore
      }
    }

    // Poll every 60 seconds
    checkInterval = setInterval(checkIdle, 60_000)

    // Also run immediately on mount
    checkIdle()

    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        document.removeEventListener(event, recordActivity)
      })
      if (checkInterval) clearInterval(checkInterval)
    }
  }, [])
}