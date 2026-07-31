import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

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
  const cacheHeaders = {
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
  }
  try {
    const token = getToken(request)
    let url = `${BACKEND_URL}/api/candidate/attempts`
    const headers: Record<string, string> = {}

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['Cookie'] = `candidate_session=${token}`
    } else {
      // Fallback: try NextAuth session to fetch by email
      const session = await getServerSession(authOptions)
      if (session?.user?.email) {
        url = `${BACKEND_URL}/api/candidate/attempts?email=${encodeURIComponent(session.user.email)}`
      } else {
        console.warn('[candidate/attempts] No auth token or NextAuth session found — returning empty attempts')
        return NextResponse.json({ attempts: [], cooldownUntil: null, cooldownDays: 3 }, { headers: cacheHeaders })
      }
    }

    const res = await fetch(url, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status, headers: cacheHeaders })
    }

    const data = await res.json()
    console.log('[attempts/route] BACKEND RESPONSE:', JSON.stringify(data))
    return NextResponse.json(data, { status: res.status, headers: cacheHeaders })
  } catch (error) {
    console.error('[candidate/attempts]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}