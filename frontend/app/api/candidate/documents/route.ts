import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  const redis = request.headers.get('x-redis-token')
  if (redis) return redis
  return request.cookies.get('candidate_session')?.value ?? null
}

export async function GET(request: NextRequest) {
  try {
    const token = getToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const res = await fetch(`${BACKEND_URL}/api/candidate/documents`, {
      headers: { Authorization: `Bearer ${token}`, Cookie: `candidate_session=${token}` },
      credentials: 'include',
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[candidate/documents GET] Backend error:', text)
      return NextResponse.json({ error: `Backend status ${res.status}: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error('[candidate/documents GET]', error)
    return NextResponse.json({ error: `NextJS proxy error: ${error.message || error}` }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getToken(request)
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

    if (!res.ok) {
      const text = await res.text()
      console.error('[candidate/documents POST] Backend error:', text)
      return NextResponse.json({ error: `Backend status ${res.status}: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error('[candidate/documents POST]', error)
    return NextResponse.json({ error: `NextJS proxy error: ${error.message || error}` }, { status: 500 })
  }
}