import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function GET(request: NextRequest) {
  try {
    const adminToken = request.headers.get('X-Admin-Token')

    const response = await fetch(`${BACKEND_URL}/api/admin/settings/anti-cheat-config`, {
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      },
      credentials: 'include',
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[admin/anti-cheat] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch anti-cheat settings' }, { status: 502 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const adminToken = request.headers.get('X-Admin-Token')
    const body = await request.json()

    const response = await fetch(`${BACKEND_URL}/api/admin/settings/anti-cheat-config`, {
      method: 'PUT',
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
    console.error('[admin/anti-cheat] PUT error:', error)
    return NextResponse.json({ error: 'Failed to update anti-cheat settings' }, { status: 502 })
  }
}