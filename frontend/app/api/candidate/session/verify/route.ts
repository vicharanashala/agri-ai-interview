import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? ''

    const res = await fetch(`${BACKEND_URL}/api/candidate/session/verify`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      credentials: 'include',
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[candidate/session/verify] Proxy error:', error)
    return NextResponse.json({ error: 'Failed to verify session' }, { status: 502 })
  }
}