import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  const redis = request.headers.get('x-redis-token')
  if (redis) return redis
  return request.cookies.get('candidate_session')?.value ?? null
}

export async function POST(request: NextRequest) {
  try {
    const token = getToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Extract the field_name from the searchParams
    const url = new URL(request.url)
    const field_name = url.searchParams.get('field_name')
    
    if (!field_name) {
      return NextResponse.json({ error: 'field_name is required' }, { status: 400 })
    }

    const formData = await request.formData()
    const backendFormData = new FormData()

    for (const [key, value] of formData.entries()) {
      if (key !== 'credentials') {
        backendFormData.append(key, value)
      }
    }

    const res = await fetch(`${BACKEND_URL}/api/candidate/documents/validate?field_name=${field_name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Cookie: `candidate_session=${token}` },
      body: backendFormData,
      credentials: 'include',
    })

    if (!res.ok) {
      const text = await res.text()
      try {
        const parsed = JSON.parse(text)
        return NextResponse.json({ error: parsed.detail || text }, { status: res.status })
      } catch (e) {
        return NextResponse.json({ error: `Backend status ${res.status}: ${text}` }, { status: res.status })
      }
    }

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error('[candidate/documents/validate POST]', error)
    return NextResponse.json({ error: `NextJS proxy error: ${error.message || error}` }, { status: 500 })
  }
}
