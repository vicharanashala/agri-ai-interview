import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL ?? ''

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const auth = request.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : request.cookies.get('candidate_session')?.value ?? null
    if (!token) {
      // No resume uploaded yet — return null response, not error
      return NextResponse.json({ exists: false })
    }

    const res = await fetch(`${BACKEND_URL}/api/candidate/resume`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `candidate_session=${token}`,
      },
      credentials: 'include',
    })

    if (res.status === 401) {
      // Session expired or invalid — no resume to show
      return NextResponse.json({ exists: false })
    }

    if (!res.ok) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json(await res.json())
  } catch (err) {
    console.error('[api/candidate/resume GET]', err)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
  }
}