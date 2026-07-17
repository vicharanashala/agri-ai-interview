import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL

// Check both Authorization header (sessionStorage forwarded by authFetch)
// and candidate_session httpOnly cookie — one of them will be present.
function getToken(request: NextRequest): string | null {
  // 1. Authorization header (authFetch / interceptAuthFetch sets this from sessionStorage)
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)

  // 2. candidate_session httpOnly cookie (set by backend on session creation)
  return request.cookies.get('candidate_session')?.value ?? null
}

export async function GET(request: NextRequest) {
  try {
    const token = getToken(request)
    if (!token) {
      // Graceful degradation — return empty attempts so the dashboard still loads
      console.warn('[candidate/attempts] No auth token found — returning empty attempts')
      return NextResponse.json({ attempts: [], cooldownUntil: null, cooldownDays: 3 })
    }

    const res = await fetch(`${BACKEND_URL}/api/candidate/attempts`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `candidate_session=${token}`,
      },
      credentials: 'include',
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[candidate/attempts]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}