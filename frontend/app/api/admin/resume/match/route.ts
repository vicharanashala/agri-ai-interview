import { NextRequest, NextResponse } from 'next/server'

// BACKEND_URL is server-only (not NEXT_PUBLIC_), set by the deployment environment.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8003'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = new URLSearchParams()
    for (const [k, v] of searchParams.entries()) params.append(k, v)

    const adminToken = process.env.INTERNAL_SERVICE_TOKEN || ''

    const res = await fetch(`${BACKEND_URL}/api/admin/resume/match?${params}`, {
      headers: { 'X-Admin-Token': adminToken },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin/resume/match]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}