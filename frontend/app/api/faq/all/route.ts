import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL;

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/faq/all`, {
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch FAQs" }, { status: 500 });
  }
}