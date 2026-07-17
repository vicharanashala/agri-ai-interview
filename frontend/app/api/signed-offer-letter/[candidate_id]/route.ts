import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidate_id: string }> }
) {
  try {
    const { candidate_id } = await params;
    const backendUrl = `${BACKEND_URL}/api/signed-offer-letter/${encodeURIComponent(candidate_id)}`;

    const response = await fetch(backendUrl, {
      headers: { 'Accept': 'application/pdf' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch signed offer letter' }));
      return NextResponse.json(error, { status: response.status });
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    console.error('[signed-offer-letter] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch signed offer letter' }, { status: 502 });
  }
}