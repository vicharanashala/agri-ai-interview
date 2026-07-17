import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || 'Candidate';
    const email = searchParams.get('email') || 'candidate@email.com';
    const phone = searchParams.get('phone') || '+91 9876543210';
    const action = searchParams.get('action') || 'view';

    const backendUrl = process.env.BACKEND_URL;
    const backendEndpoint = `${backendUrl}/api/offer-letter?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&action=${action}`;

    const response = await fetch(backendEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/pdf',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to generate offer letter');
    }

    const blob = await response.blob();
    
    // Return the PDF with appropriate headers
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': action === 'download' 
          ? `attachment; filename="Offer_Letter_${name.replace(/\s+/g, '_')}.pdf"` 
          : 'inline',
      },
    });
  } catch (error) {
    console.error('Error fetching offer letter:', error);
    return NextResponse.json(
      { error: 'Failed to fetch offer letter' },
      { status: 500 }
    );
  }
}