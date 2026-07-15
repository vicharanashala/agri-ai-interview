import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('candidate_session')?.value()
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await fetch(`${BACKEND_URL}/api/candidate/documents`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: `candidate_session=${token}` },
      credentials: 'include',
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[candidate/documents GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('candidate_session')?.value()
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const backendFormData = new FormData()

    for (const [key, value] of formData.entries()) {
      if (key !== 'credentials') {
        backendFormData.append(key, value)
      }
    }

    const res = await fetch(`${BACKEND_URL}/api/candidate/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Cookie: `candidate_session=${token}` },
      body: backendFormData,
      credentials: 'include',
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error) {
    console.error('[candidate/documents POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}