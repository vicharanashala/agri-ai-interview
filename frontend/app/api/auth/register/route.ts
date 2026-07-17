import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

const BACKEND_URL = process.env.BACKEND_URL

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, password } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data.detail ?? data.error ?? 'Registration failed' }, { status: res.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[auth/register]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}