import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.BACKEND_URL || 'http://agri-interview-backend:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const authHeader = request.headers.get('Authorization');
    const cookie = request.headers.get('cookie') || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;
    if (cookie) headers['cookie'] = cookie;

    const response = await fetch(`${API_BASE_URL}/api/interview/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        candidate_id: body.candidate_id,
        interview_id: body.interview_id,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error proxying heartbeat to backend:', error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}
