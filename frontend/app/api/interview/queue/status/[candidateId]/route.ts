import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = 'http://backend:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const response = await fetch(
      `${API_BASE_URL}/api/interview/queue/status/${candidateId}`,
      { method: 'GET' }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error proxying to backend:', error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}