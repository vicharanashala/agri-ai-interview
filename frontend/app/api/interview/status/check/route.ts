import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidate_id');
    const backendUrl = process.env.BACKEND_URL;

    const authHeader = request.headers.get('Authorization');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const url = candidateId
      ? `${backendUrl}/api/interview/status/check?candidate_id=${candidateId}`
      : `${backendUrl}/api/interview/status/check`;

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to check interview status' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error checking interview status:', error);
    return NextResponse.json(
      { error: 'Failed to check interview status' },
      { status: 500 }
    );
  }
}