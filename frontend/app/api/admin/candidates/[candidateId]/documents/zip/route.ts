import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const session = await import("next-auth").then(m => m.getServerSession(authOptions));
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId } = await params;
    const adminSession = request.cookies.get("admin_session")?.value;
    const headers = {} as Record<string, string>;
    if (adminSession) headers["Cookie"] = `admin_session=${adminSession}`;
    if (process.env.ADMIN_SECRET) headers["X-Admin-Token"] = process.env.ADMIN_SECRET;

    const res = await fetch(
      `${API_BASE}/api/admin/candidates/${candidateId}/documents/zip`,
      { headers }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.detail || "Failed" }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    const disposition = res.headers.get("content-disposition") || "";
    const filenameMatch = disposition.match(/filename="(.+)"/);
    const filename = filenameMatch ? filenameMatch[1] : `${candidateId}_documents.zip`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}