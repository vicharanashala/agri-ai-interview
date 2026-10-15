import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import {
  extractCandidateToken,
  sessionCheckFailure,
  verifyCandidateSessionForUser,
} from '@/lib/candidate-session-auth'

const BACKEND_URL = process.env.BACKEND_URL

// Read candidate session token from Authorization header (authFetch / sessionStorage)
// or candidate_session httpOnly cookie — one will be present.
function getCandidateToken(request: NextRequest): string | null {
  return extractCandidateToken(
    request.headers.get('authorization'),
    request.cookies.get('candidate_session')?.value
  )
}

export async function GET(request: NextRequest) {
  const headers = {
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
  }
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') ?? session.user.email

    const res = await fetch(
      `${BACKEND_URL}/api/candidate?email=${encodeURIComponent(email)}`,
      { cache: 'no-store', credentials: 'include' }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status, headers })
    }

    const data = await res.json()
    if (!data.fullName && session?.user?.name) {
      data.fullName = session.user.name
    }
    if (!data.email && session?.user?.email) {
      data.email = session.user.email
    }

    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error('[api/candidate GET]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502, headers })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const token = getCandidateToken(request)
    const email = session?.user?.email

    // A token, when present, must be a live backend session owned by the
    // signed-in user. Rejecting here (rather than falling back to email) keeps
    // a stale or foreign token from writing to another candidate's profile.
    if (token) {
      const check = await verifyCandidateSessionForUser(BACKEND_URL, token, session.user.id)
      if (!check.ok) {
        const failure = sessionCheckFailure(check)
        return NextResponse.json(failure.body, { status: failure.status })
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cookie': token ? `candidate_session=${token}` : '',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else if (email) {
      // New user without candidate session yet — pass email for email-based auth fallback
      headers['X-User-Email'] = email
    }

    const res = await fetch(`${BACKEND_URL}/api/candidate`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (error) {
    console.error('[api/candidate POST]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
  }
}

// For routes that act only through the backend session (no email fallback):
// require a token that is a live backend session owned by the signed-in user.
async function requireOwnCandidateToken(
  request: NextRequest
): Promise<{ token: string; response?: undefined } | { token?: undefined; response: NextResponse }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = getCandidateToken(request)
  if (!token) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const check = await verifyCandidateSessionForUser(BACKEND_URL, token, session.user.id)
  if (!check.ok) {
    const failure = sessionCheckFailure(check)
    return { response: NextResponse.json(failure.body, { status: failure.status }) }
  }

  return { token }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireOwnCandidateToken(request)
    if (auth.response) return auth.response
    const { token } = auth

    const body = await request.json()
    const res = await fetch(`${BACKEND_URL}/api/candidate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Cookie': `candidate_session=${token}`,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (error) {
    console.error('[api/candidate PATCH]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireOwnCandidateToken(request)
    if (auth.response) return auth.response
    const { token } = auth

    const res = await fetch(`${BACKEND_URL}/api/candidate`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cookie': `candidate_session=${token}`,
      },
      credentials: 'include',
    })

    return NextResponse.json(await res.json(), { status: res.status })
  } catch (error) {
    console.error('[api/candidate DELETE]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
  }
}