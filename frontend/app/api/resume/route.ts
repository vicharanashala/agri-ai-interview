import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = request.cookies.get('candidate_session')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Look up candidate_id via backend (requires candidate_session token)
    const candRes = await fetch(
      `${BACKEND_URL}/api/candidate/session/verify`,
      { headers: { Authorization: `Bearer ${token}`, Cookie: `candidate_session=${token}` } }
    )
    if (!candRes.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { candidate_id } = await candRes.json()

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    const backendFormData = new FormData()
    backendFormData.append('file', file)
    backendFormData.append('candidateId', candidate_id)

    const authHeader = request.headers.get('Authorization') ?? ''
    const backendRes = await fetch(`${BACKEND_URL}/api/resume/upload`, {
      method: 'POST',
      headers: { Authorization: authHeader, Cookie: `candidate_session=${token}` },
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