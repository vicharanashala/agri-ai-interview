import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { candidate_id, signatureName, signedAt } = body;

    if (!candidate_id || !signatureName) {
      return NextResponse.json(
        { error: 'candidate_id and signatureName are required' },
        { status: 400 }
      );
    }

    const backendUrl = `${BACKEND_URL}/api/signed-offer-letter?candidate_id=${encodeURIComponent(candidate_id)}`;
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureName, signedAt }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[signed-offer-letter] POST error:', error);
    return NextResponse.json({ error: 'Failed to sign offer letter' }, { status: 502 });
  }
}