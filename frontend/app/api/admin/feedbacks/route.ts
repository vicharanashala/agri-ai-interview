import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://agri-interview-backend:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = new URLSearchParams()
    for (const [k, v] of searchParams.entries()) {
      params.append(k, v)
    }

    const adminToken = request.headers.get('X-Admin-Token') || process.env.INTERNAL_SERVICE_TOKEN || ''
    const cookie = request.headers.get('cookie') || ''

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (adminToken) {
      headers['X-Admin-Token'] = adminToken
    }
    if (cookie) {
      headers['cookie'] = cookie
    }

    const res = await fetch(`${BACKEND_URL}/api/admin/feedbacks?${params}`, {
      headers,
      credentials: 'include',
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin/feedbacks] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
