import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('candidate_session')?.value()
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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