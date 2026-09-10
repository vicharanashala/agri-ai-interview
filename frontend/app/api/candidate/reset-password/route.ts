import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${BACKEND_URL}/api/candidate/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (error) {
    console.error('[api/candidate/reset-password POST]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
  }
}
