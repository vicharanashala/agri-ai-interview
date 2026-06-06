import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string; fieldName: string }> }
) {
  try {
    const session = await import("next-auth").then(m => m.getServerSession(authOptions));
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId, fieldName } = await params;
    const res = await fetch(
      `${API_BASE}/api/admin/candidates/${candidateId}/documents/${fieldName}`,
      { headers: { "X-Admin-Token": process.env.ADMIN_SECRET || "" } }
    );

    if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });

    const bytes = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const disposition = res.headers.get("content-disposition") || "";
    const filenameMatch = disposition.match(/filename="(.+)"/);
    const filename = filenameMatch ? filenameMatch[1] : fieldName;

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string; fieldName: string }> }
) {
  try {
    const session = await import("next-auth").then(m => m.getServerSession(authOptions));
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { candidateId, fieldName } = await params;
    const res = await fetch(
      `${API_BASE}/api/admin/candidates/${candidateId}/documents/${fieldName}`,
      {
        method: "DELETE",
        headers: { "X-Admin-Token": process.env.ADMIN_SECRET || "" },
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.detail || "Failed" }, { status: res.status });
    }

    // Also reset documentsSubmitted on candidate if it was the only doc
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { documentsSubmitted: false },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}