import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";

const API_BASE = process.env.BACKEND_URL;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const session = await import("next-auth").then(m => m.getServerSession(authOptions));
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId } = await params;
    const res = await fetch(
      `${API_BASE}/api/admin/candidates/${candidateId}/send-offer-email`,
      {
        method: "POST",
        headers: { "X-Admin-Token": process.env.ADMIN_SECRET || "" },
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.detail || "Failed to send email" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}