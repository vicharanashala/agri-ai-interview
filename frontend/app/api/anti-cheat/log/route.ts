import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const API_BASE_URL = process.env.BACKEND_URL ?? 'http://backend:8000';

// Pre-computed bcrypt hash of the admin password — same as backend auth.py
// This avoids storing the raw password in env or client-visible code
function getAdminToken(): string {
  const secret = process.env.ANTI_CHEAT_ADMIN_SECRET || 'anti-cheat-internal';
  return crypto.createHmac('sha256', secret).update('admin').digest('hex');
}

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

    const token = getAdminToken();

    const backendResponse = await fetch(`${API_BASE_URL}/api/admin/anti-cheat/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token,
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