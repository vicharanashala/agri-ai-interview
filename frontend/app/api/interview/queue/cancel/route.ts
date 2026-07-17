import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.BACKEND_URL;

export async function DELETE(request: NextRequest) {
  try {
    let candidateId: string | undefined;
    let interviewId: string | undefined;

    try {
      const body = await request.json();
      candidateId = body.candidate_id;
      interviewId = body.interview_id;
    } catch {
      // body parsing failed — continue without it
    }

    // Also try Authorization header (set by authFetch from sessionStorage token)
    const authHeader = request.headers.get('Authorization') ?? '';

    const backendBody: Record<string, string> = {};
    if (candidateId) backendBody['candidate_id'] = candidateId;
    if (interviewId) backendBody['interview_id'] = interviewId;

    const response = await fetch(`${API_BASE_URL}/api/interview/queue/cancel`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(backendBody),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error proxying cancel to backend:', error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}