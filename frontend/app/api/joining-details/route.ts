import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = 'http://backend:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${API_BASE_URL}/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('Backend error:', response.status);
      return NextResponse.json(
        { error: 'Failed to generate PDF' },
        { status: response.status }
      );
    }

    // Get the PDF as a buffer
    const pdfBuffer = await response.arrayBuffer();

    // Return the PDF with proper headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment; filename="joining-details.pdf"',
      },
    });
  } catch (error) {
    console.error('Error proxying to backend:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate PDF: ${message}` },
      { status: 500 }
    );
  }
}