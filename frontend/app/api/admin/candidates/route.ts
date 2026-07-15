import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const params = new URLSearchParams()
    for (const [k, v] of searchParams.entries()) params.append(k, v)

    const adminToken = process.env.INTERNAL_SERVICE_TOKEN || ''

    const res = await fetch(`${API_BASE}/api/admin/candidates?${params}`, {
      headers: { 'X-Admin-Token': adminToken },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[admin/candidates]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}