import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Anti-cheat events are logged by the candidate frontend during interview.
// The session token (Authorization: Bearer) is forwarded to the backend.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { candidateId, interviewId, eventType, severity, message, metadata } = body;

    if (!candidateId || !eventType) {
      return NextResponse.json(
        { error: 'candidateId and eventType are required' },
        { status: 400 }
      );
    }

    // Forward candidate session token to backend
    const authHeader = request.headers.get('authorization') ?? ''

    const backendResponse = await fetch(`${API_BASE_URL}/api/anti-cheat/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        candidateId,
        interviewId: interviewId || null,
        eventType,
        severity: severity || 'warning',
        message: message || null,
        metadata: metadata || null,
      }),
    });

    const data = await backendResponse.json();

    if (!backendResponse.ok) {
      console.error('Anti-cheat log backend error:', data);
      return NextResponse.json(data, { status: backendResponse.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error logging anti-cheat event:', error);
    return NextResponse.json(
      { error: 'Failed to log anti-cheat event' },
      { status: 500 }
    );
  }
}