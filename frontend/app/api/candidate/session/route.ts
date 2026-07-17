import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL

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

    // Forward the candidate_session cookie from backend to the browser
    const setCookie = response.headers.get('set-cookie')
    const nextResponse = NextResponse.json(data)
    if (setCookie) {
      nextResponse.headers.append('set-cookie', setCookie)
    }

    return nextResponse
  } catch (error) {
    console.error('[candidate/session] Proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 502 }
    )
  }
}