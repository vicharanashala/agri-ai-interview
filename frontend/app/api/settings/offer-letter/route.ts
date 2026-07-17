import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL;

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/public/offer-letter-config`, {
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[settings/offer-letter] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch offer letter config' }, { status: 502 });
  }
}