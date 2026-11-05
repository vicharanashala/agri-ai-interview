import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://agri-interview-backend:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> }
) {
  try {
    const { feedbackId } = await params
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

    const res = await fetch(`${BACKEND_URL}/api/admin/feedbacks/${feedbackId}`, {
      headers,
      credentials: 'include',
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin/feedbacks/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
