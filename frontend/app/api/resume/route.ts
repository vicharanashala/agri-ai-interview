import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import {
  extractCandidateToken,
  sessionCheckFailure,
  verifyCandidateSessionForUser,
} from '@/lib/candidate-session-auth'

const BACKEND_URL = process.env.BACKEND_URL

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Same token resolution as /api/candidate POST so the profile save and the
    // resume upload act on the same backend session.
    const token = extractCandidateToken(
      request.headers.get('authorization'),
      request.cookies.get('candidate_session')?.value
    )
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve candidate_id from the backend session and make sure it belongs to
    // the signed-in user — the resume is stored under this candidate_id.
    const check = await verifyCandidateSessionForUser(BACKEND_URL, token, session.user.id)
    if (!check.ok) {
      const { body, status } = sessionCheckFailure(check)
      return NextResponse.json(body, { status })
    }
    const candidate_id = check.candidateId

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    const backendFormData = new FormData()
    backendFormData.append('file', file)
    backendFormData.append('candidateId', candidate_id)

    const backendRes = await fetch(`${BACKEND_URL}/api/resume/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Cookie: `candidate_session=${token}` },
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