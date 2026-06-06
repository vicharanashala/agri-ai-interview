import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the Redis session token from the browser's sessionStorage
    // (set by the candidate login flow) and forward it as Bearer auth
    const redisToken = request.headers.get('x-redis-token')
      || request.cookies.get('candidate_session_token')?.value

    const backendUrl = `${API_BASE}/api/candidate/documents`
    const response = await fetch(backendUrl, {
      headers: {
        ...(redisToken ? { Authorization: `Bearer ${redisToken}` } : {}),
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const redisToken = request.headers.get('x-redis-token')
      || request.cookies.get('candidate_session_token')?.value

    // Forward the raw FormData to backend (including file uploads)
    const formData = await request.formData()
    const backendUrl = `${API_BASE}/api/candidate/documents`
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        ...(redisToken ? { Authorization: `Bearer ${redisToken}` } : {}),
      },
      body: formData,
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return NextResponse.json({ error: data.detail || 'Upload failed' }, { status: response.status })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error uploading documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}