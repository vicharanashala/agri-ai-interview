import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? 'http://backend:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question } = body;

    if (!question || question.trim().length < 2) {
      return NextResponse.json({ error: "Question must be at least 2 characters" }, { status: 400 });
    }

    const response = await fetch(`${BACKEND}/api/faq/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question.trim() }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "FAQ service error" }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}