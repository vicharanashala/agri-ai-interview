import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL || (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')

// Read candidate session token from request cookies
function getCandidateToken(request: NextRequest): string | null {
  return request.cookies.get('candidate_session')?.value() ?? null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') ?? session.user.email

    const res = await fetch(
      `${BACKEND_URL}/api/candidate?email=${encodeURIComponent(email)}`,
      { cache: 'no-store', credentials: 'include' }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (error) {
    console.error('[api/candidate GET]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cookie': token ? `candidate_session=${token}` : '',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

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

export async function PATCH(request: NextRequest) {
  try {
    const token = getCandidateToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    const token = getCandidateToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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