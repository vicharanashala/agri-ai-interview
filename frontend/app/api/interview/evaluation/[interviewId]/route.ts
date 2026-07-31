import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.BACKEND_URL;

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return request.cookies.get('candidate_session')?.value ?? null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ interviewId: string }> }
) {
  const cacheHeaders = {
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
  };
  try {
    const { interviewId } = await params;
    const token = getToken(request);

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['Cookie'] = `candidate_session=${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/interview/evaluation/${interviewId}`, {
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status, headers: cacheHeaders });
  } catch (error) {
    console.error('Error fetching evaluation:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch evaluation' },
      { status: 500, headers: cacheHeaders }
    );
  }
}