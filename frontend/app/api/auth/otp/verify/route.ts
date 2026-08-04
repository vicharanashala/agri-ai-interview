import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, otp } = body

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP are required' }, { status: 400 })
    }

    const res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail ?? data.error ?? 'Verification failed' },
        { status: res.status }
      )
    }

    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error('[auth/otp/verify]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}