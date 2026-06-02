import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://backend:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Proxy download request to FastAPI backend
    const backendRes = await fetch(`${BACKEND_URL}/api/resume/${id}`, {
      headers: {
        'Accept': 'application/octet-stream',
      },
    })

    if (!backendRes.ok) {
      return NextResponse.json({ error: 'Resume not found' }, { status: backendRes.status })
    }

    const buffer = await backendRes.arrayBuffer()

    // Extract filename from Content-Disposition header if present
    const contentDisposition = backendRes.headers.get('Content-Disposition') || ''
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=(?:(\\?['"])(.*?)\1|[^;\n]*)/)
    const filename = filenameMatch ? filenameMatch[2] : 'resume.pdf'

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/octet-stream',
      },
    })
  } catch (err) {
    console.error('[resume/download] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}