import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    const authHeader = request.headers.get('Authorization');
    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(
      `${API_BASE_URL}/api/interview/queue/wait-time/${candidateId}`,
      { method: 'GET', headers }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error proxying to backend:', error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}
