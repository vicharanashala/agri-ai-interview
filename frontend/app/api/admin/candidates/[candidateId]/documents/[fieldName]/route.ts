import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.BACKEND_URL

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string; fieldName: string }> }
) {
  try {
    const { candidateId, fieldName } = await params
    const adminToken = process.env.INTERNAL_SERVICE_TOKEN || ''
    const res = await fetch(
      `${API_BASE}/api/admin/candidates/${candidateId}/documents/${fieldName}`,
      { headers: { 'X-Admin-Token': adminToken } }
    )

    if (!res.ok) return NextResponse.json({ error: 'Failed' }, { status: res.status })

    const bytes = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const disposition = res.headers.get('content-disposition') || ''
    const filenameMatch = disposition.match(/filename="(.+)"/)
    const filename = filenameMatch ? filenameMatch[1] : fieldName

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string; fieldName: string }> }
) {
  try {
    const { candidateId, fieldName } = await params
    const adminToken = process.env.INTERNAL_SERVICE_TOKEN || ''
    const res = await fetch(
      `${API_BASE}/api/admin/candidates/${candidateId}/documents/${fieldName}`,
      { method: 'DELETE', headers: { 'X-Admin-Token': adminToken } }
    )
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}