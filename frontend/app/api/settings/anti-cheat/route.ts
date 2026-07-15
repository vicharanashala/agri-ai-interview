import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// Internal service token — allows server-side routes to call admin endpoints
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? ''

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/settings/anti-cheat`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': INTERNAL_SERVICE_TOKEN,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[settings/anti-cheat] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 502 })
  }
}