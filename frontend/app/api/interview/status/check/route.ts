import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const backendUrl = 'http://backend:8000';
    const response = await fetch(`${backendUrl}/api/interview/status/check`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

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