import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL || 'http://agri-interview-backend:8000'

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return request.cookies.get('candidate_session')?.value ?? null
}

export async function GET(request: NextRequest) {
  const cacheHeaders = {
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
  }
  try {
    const token = getToken(request)
    const { searchParams } = new URL(request.url)
    const interviewId = searchParams.get('interview_id')
    let url = `${BACKEND_URL}/api/candidate/re-evaluation-status`
    if (interviewId) {
      url += `?interview_id=${encodeURIComponent(interviewId)}`
    }

    const headers: Record<string, string> = {}

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['Cookie'] = `candidate_session=${token}`
    } else {
      const session = await getServerSession(authOptions)
      if (session?.user?.email) {
        headers['X-User-Email'] = session.user.email
      }
    }

    const res = await fetch(url, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status, headers: cacheHeaders })
  } catch (error) {
    console.error('[candidate/re-evaluation-status]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cacheHeaders })
  }
}
