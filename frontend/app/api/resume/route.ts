import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Enforce 5MB limit at frontend too
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    // Get candidateId for the logged-in user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { candidate: { select: { id: true } } }
    })
    if (!user?.candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    const candidateId = user.candidate.id

    // Forward to FastAPI backend as multipart/form-data
    const backendFormData = new FormData()
    backendFormData.append('file', file)
    backendFormData.append('candidateId', candidateId)

    const backendRes = await fetch(`${BACKEND_URL}/api/resume/upload`, {
      method: 'POST',
      body: backendFormData,
    })

    if (!backendRes.ok) {
      const err = await backendRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.detail || 'Upload failed' }, { status: backendRes.status })
    }

    const result = await backendRes.json()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[resume/upload] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}