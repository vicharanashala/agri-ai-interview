import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";

const API_BASE = process.env.BACKEND_URL;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const session = await import("next-auth").then(m => m.getServerSession(authOptions));
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId } = await params;
    const res = await fetch(
      `${API_BASE}/api/admin/candidates/${candidateId}/documents/reset`,
      {
        method: "PATCH",
        headers: { "X-Admin-Token": process.env.ADMIN_SECRET || "" },
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.detail || "Failed" }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}