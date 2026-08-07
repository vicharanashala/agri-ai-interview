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
  try {
    const token = getToken(request)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['Cookie'] = `candidate_session=${token}`
    } else {
      const session = await getServerSession(authOptions)
      if (session?.user?.email) {
        headers['X-User-Email'] = session.user.email
      }
    }

    const res = await fetch(`${BACKEND_URL}/api/candidate/session-summary`, {
      method: 'GET',
      headers,
      credentials: 'include',
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('Error proxying candidate session summary:', error)
    return NextResponse.json(
      { detail: 'Failed to connect to backend server' },
      { status: 502 }
    )
  }
}
