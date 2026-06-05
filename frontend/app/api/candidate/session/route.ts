import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { candidate_id, email } = body

    if (!candidate_id || !email) {
      return NextResponse.json(
        { error: 'candidate_id and email are required' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `${BACKEND_URL}/api/candidate/session`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ candidate_id, email }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[candidate/session] Proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 502 }
    )
  }
}