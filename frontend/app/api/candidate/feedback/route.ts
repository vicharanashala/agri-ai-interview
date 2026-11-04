import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL || 'http://agri-interview-backend:8000'

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return request.cookies.get('candidate_session')?.value ?? null
}

async function buildHeaders(request: NextRequest): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  const token = getToken(request)

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    headers['Cookie'] = `candidate_session=${token}`
  } else {
    const session = await getServerSession(authOptions)
    if (session?.user?.email) {
      headers['X-User-Email'] = session.user.email
    }
  }

  return headers
}

export async function GET(request: NextRequest) {
  const cacheHeaders = {
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
  }
  try {
    const headers = await buildHeaders(request)

    const res = await fetch(`${BACKEND_URL}/api/candidate/feedback`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status, headers: cacheHeaders })
  } catch (error) {
    console.error('[candidate/feedback GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cacheHeaders })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const headers = await buildHeaders(request)
    headers['Content-Type'] = 'application/json'

    const res = await fetch(`${BACKEND_URL}/api/candidate/feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[candidate/feedback POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
