import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.BACKEND_URL;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const interviewId = body.interviewId;
    
    const authHeader = request.headers.get('Authorization');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(`${API_URL}/api/interview/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        interview_id: interviewId,
        message: body.message,
      }),
    });

    // Check if the response is OK before parsing JSON
    if (!response.ok) {
      let errorMessage = 'Failed to send message';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.error || errorMessage;
      } catch {
        // If we can't parse error response, use status text
        errorMessage = response.statusText || errorMessage;
      }
      console.error('Backend error:', response.status, errorMessage);
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
