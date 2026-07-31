import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL

function getCandidateToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return request.cookies.get('candidate_session')?.value ?? null
}

export async function POST(request: NextRequest) {
  try {
    const token = getCandidateToken(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const res = await fetch(
      `${BACKEND_URL}/api/candidate/foundation-course/launch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cookie': `candidate_session=${token}`,
        },
        credentials: 'include',
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (error) {
    console.error('[api/foundation-course/launch POST]', error)
    return NextResponse.json({ error: 'Bad gateway' }, { status: 502 })
  }
}
