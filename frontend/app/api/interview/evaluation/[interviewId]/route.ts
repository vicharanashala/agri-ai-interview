import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.BACKEND_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ interviewId: string }> }
) {
  try {
    const { interviewId } = await params;

    const response = await fetch(`${API_BASE_URL}/api/interview/evaluation/${interviewId}`, {
      method: 'GET',
      credentials: 'include',
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching evaluation:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch evaluation' },
      { status: 500 }
    );
  }
}