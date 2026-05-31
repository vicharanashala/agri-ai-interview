import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Transform frontend data to backend format
    // Backend expects: { candidate_data: {...}, candidate_id?: string }
    const candidateName = body.candidateData?.name || body.candidate_data?.name || body.name || 'Demo Candidate';
    const candidateId = body.candidate_id || body.candidateId || 'demo-candidate-id';
    
    const backendRequest = {
      candidate_data: body.candidateData || {
        name: candidateName,
        position: body.position || 'Software Engineer',
        farming_background: body.farmingBackground || '',
        experience_years: body.experienceYears || 0,
        crops_grown: body.cropsGrown || '',
        farming_type: body.farmingType || '',
        land_size: body.landSize || '',
      },
      // Backend Pydantic model uses snake_case: candidate_id, not candidateId
      candidate_id: candidateId,
    };

    const response = await fetch(`${API_BASE_URL}/api/interview/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backendRequest),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Backend error:', data);
      return NextResponse.json(data, { status: response.status });
    }

    // Return the response with question field normalized
    return NextResponse.json({
      interviewId: data.interviewId || data.interview_id,
      question: data.question,
      greeting: data.question,
      status: data.status,
    });
  } catch (error) {
    console.error('Error proxying to backend:', error);
    return NextResponse.json(
      { error: 'Failed to start interview. Please ensure the backend server is running.' },
      { status: 500 }
    );
  }
}
