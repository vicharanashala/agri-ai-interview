import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest) {
  try {
    const adminToken = request.headers.get('X-Admin-Token')
    const body = await request.json()

    const response = await fetch(`${BACKEND_URL}/api/admin/settings/offer-letter-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[admin/offer-letter-preview] POST error:', error)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 502 })
  }
}