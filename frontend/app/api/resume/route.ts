import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL

function getCandidateToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return request.cookies.get('candidate_session')?.value ?? null
}

async function resolveCandidateId(request: NextRequest, email: string): Promise<string | null> {
  const token = getCandidateToken(request)
  if (token) {
    try {
      const candRes = await fetch(`${BACKEND_URL}/api/candidate/session/verify`, {
        headers: { Authorization: `Bearer ${token}`, Cookie: `candidate_session=${token}` },
      })
      if (candRes.ok) {
        const { candidate_id } = await candRes.json()
        if (candidate_id) return candidate_id
      }
    } catch {}
  }

  // Fallback to lookup candidate by email
  try {
    const res = await fetch(`${BACKEND_URL}/api/candidate?email=${encodeURIComponent(email)}`, {
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.id) return data.id
    }
  } catch {}

  return null
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    let candidateId = (formData.get('candidateId') as string) || null
    if (!candidateId) {
      candidateId = await resolveCandidateId(request, session.user.email)
    }

    if (!candidateId) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const backendFormData = new FormData()
    backendFormData.append('file', file)
    backendFormData.append('candidateId', candidateId)

    const token = getCandidateToken(request)
    const headers: Record<string, string> = {
      'X-User-Email': session.user.email,
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['Cookie'] = `candidate_session=${token}`
    }

    const backendRes = await fetch(`${BACKEND_URL}/api/resume/upload`, {
      method: 'POST',
      headers,
      body: backendFormData,
      credentials: 'include',
    })

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.detail || 'Upload failed' }, { status: backendRes.status })
    }

    const result = await backendRes.json()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[resume/upload]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const candidateId = await resolveCandidateId(request, session.user.email)
    if (!candidateId) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 })
    }

    const token = getCandidateToken(request)
    const headers: Record<string, string> = {
      'X-User-Email': session.user.email,
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['Cookie'] = `candidate_session=${token}`
    }

    const backendRes = await fetch(`${BACKEND_URL}/api/resume?candidateId=${encodeURIComponent(candidateId)}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    })

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.detail || 'Failed to delete resume' }, { status: backendRes.status })
    }

    const result = await backendRes.json()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[resume/delete]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
