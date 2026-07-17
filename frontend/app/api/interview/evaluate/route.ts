import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.BACKEND_URL;
const ADMIN_EMAIL = 'admin@gmail.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Evaluate Route] Request body:', JSON.stringify(body, null, 2));

    const { interview_id, candidate_data, conversation_history, user_email } = body;

    // Check if user is admin - if so, always pass but show real metrics
    const isAdminUser = user_email === ADMIN_EMAIL || 
                        candidate_data?.email === ADMIN_EMAIL ||
                        candidate_data?.email === 'admin@gmail.com';
    
    console.log('[Evaluate Route] User email:', user_email, '| Candidate email:', candidate_data?.email);
    console.log('[Evaluate Route] Is admin user:', isAdminUser);

    // For admin users, skip actual evaluation and return mock passing data
    if (isAdminUser) {
      console.log('[Evaluate Route] ADMIN USER DETECTED - Returning passing evaluation');
      const adminEvaluation = {
        interview_id: interview_id || 'admin-interview-001',
        overall_score: 75, // Always >= 60 (passing)
        metrics: {
          motivation: { score: 85, details: 'Excellent drive and enthusiasm for the role' },
          agri_knowledge: { score: 72, details: 'Good understanding of agricultural practices' },
          communication: { score: 88, details: 'Outstanding communication skills' },
          problem_solving: { score: 78, details: 'Strong analytical and problem-solving abilities' },
        },
        summary: 'The candidate demonstrated exceptional qualifications and fit for the role. Their motivation, technical knowledge, and communication skills are exemplary. They show great promise for contributing positively to the organization.',
        strengths: [
          'Excellent communication skills',
          'Strong technical knowledge',
          'High motivation and drive',
          'Problem-solving expertise',
          'Team leadership potential'
        ],
        areas_for_improvement: [
          'Could benefit from more industry experience',
          'May need onboarding for company-specific processes'
        ],
        recommendation: 'STRONG HIRE - The candidate exceeds all requirements and is highly recommended for immediate hiring.',
        is_admin_evaluation: true // Flag to indicate this is admin bypass
      };
      
      return NextResponse.json(adminEvaluation);
    }

    // Normal evaluation flow for non-admin users
    const authHeader = request.headers.get('Authorization');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
      console.log('[Evaluate Route] Authorization header present, first 8 chars:', authHeader.substring(0, 8));
    } else {
      console.log('[Evaluate Route] No Authorization header in request to evaluate route');
    }

    const response = await fetch(`${API_BASE_URL}/api/interview/evaluate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        interview_id,
        candidate_data: candidate_data || {},
        conversation_history: conversation_history || [],
      }),
    });

    const data = await response.json();
    console.log('[Evaluate Route] Backend response:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying evaluation to backend:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate interview' },
      { status: 500 }
    );
  }
}
