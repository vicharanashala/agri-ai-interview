import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL

function getCandidateToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return request.cookies.get('candidate_session')?.value ?? null
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = getCandidateToken(request)
    const email = session.user.email

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cookie': token ? `candidate_session=${token}` : '',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else if (email) {
      headers['X-User-Email'] = email
    }

    const res = await fetch(`${BACKEND_URL}/api/candidate/consent/grant`, {
      method: 'POST',
      headers,
      credentials: 'include',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (error) {
    console.error('[api/candidate/consent/grant POST]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
  }
}
