import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name } = body

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    }

    const res = await fetch(`${BACKEND_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), name: name ?? '' }),
    })

    const data = await res.json()

    if (!res.ok) {
      // Forward the actual error from the backend
      return NextResponse.json(
        { error: data.detail ?? data.error ?? 'Failed to send OTP' },
        { status: res.status }
      )
    }

    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error('[auth/send-otp]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}