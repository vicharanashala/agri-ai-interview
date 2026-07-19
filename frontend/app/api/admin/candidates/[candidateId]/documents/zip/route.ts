import { NextRequest, NextResponse } from "next/server";

// BACKEND_URL is server-only (not NEXT_PUBLIC_), set by docker-compose to the Docker service name.
const API_BASE = process.env.BACKEND_URL || "http://localhost:8003";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params;
    // Forward cookies AND X-Admin-Token from the browser request to the backend.
    // withAuth (DocumentsTab) sends X-Admin-Token; cookie handles cross-origin cookie auth.
    const cookieHeader = request.headers.get("cookie") || "";
    const adminToken = request.headers.get("x-admin-token") || "";
    const headers: Record<string, string> = { cookie: cookieHeader };
    if (adminToken) headers["x-admin-token"] = adminToken;

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