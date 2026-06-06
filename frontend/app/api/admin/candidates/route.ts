import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Phase definitions in order (must match backend/app/api/admin/candidates.py)
const PHASES = ["onboarding", "interview", "summary", "offer", "signing", "joining"];
const PHASE_ORDER: Record<string, number> = Object.fromEntries(
  PHASES.map((p, i) => [p, i])
);

function buildPhases(currentPhase: string) {
  const currentIdx = PHASE_ORDER[currentPhase] ?? 0;
  return PHASES.map((phase, i) => ({
    phase,
    status: i < currentIdx ? "completed" : i === currentIdx ? "in_progress" : "pending",
    timestamp: null,
    completedAt: null,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phase = searchParams.get("phase");
    const search = searchParams.get("search");
    const state = searchParams.get("state");
    const district = searchParams.get("district");

    const rows = await prisma.candidate.findMany({
      select: {
        id: true,
        fullName: true,
        phone: true,
        state: true,
        district: true,
        currentRole: true,
        yearsOfExperience: true,
        farmingBackground: true,
        primaryExpertise: true,
        currentPhase: true,
        documentsSubmitted: true,
        createdAt: true,
        user: { select: { email: true, id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    type CandidateWithUser = typeof rows[number];

    interface TransformedCandidate {
      id: string;
      fullName: string | null;
      email: string | null;
      phone: string | null;
      state: string | null;
      district: string | null;
      currentRole: string | null;
      yearsOfExperience: number | null;
      farmingBackground: string | null;
      primaryExpertise: string | null;
      currentPhase: string;
      documentsSubmitted: boolean;
      status: string;
      phases: ReturnType<typeof buildPhases>;
      createdAt: string;
    }

    let candidates: TransformedCandidate[] = rows.map((row: CandidateWithUser) => {
      const rawFullName = row.fullName || row.user?.email || "Unknown";
      const currentPhase = row.currentPhase || "onboarding";

      return {
        id: row.id,
        fullName: rawFullName,
        email: row.user?.email ?? null,
        phone: row.phone ?? null,
        state: row.state ?? null,
        district: row.district ?? null,
        currentRole: row.currentRole ?? null,
        yearsOfExperience: row.yearsOfExperience ?? null,
        farmingBackground: row.farmingBackground ?? null,
        primaryExpertise: row.primaryExpertise ?? null,
        currentPhase,
        documentsSubmitted: row.documentsSubmitted ?? false,
        status: currentPhase === "joining" ? "completed" : "active",
        phases: buildPhases(currentPhase),
        createdAt: row.createdAt.toISOString(),
      };
    });

    // Apply filters
    if (phase) {
      candidates = candidates.filter((c) => c.currentPhase === phase);
    }
    if (search) {
      const s = search.toLowerCase();
      candidates = candidates.filter(
        (c) =>
          (c.fullName ?? "").toLowerCase().includes(s) ||
          (c.email ?? "").toLowerCase().includes(s)
      );
    }
    if (state) {
      candidates = candidates.filter(
        (c) => c.state?.toLowerCase().includes(state.toLowerCase())
      );
    }
    if (district) {
      candidates = candidates.filter(
        (c) => c.district?.toLowerCase().includes(district.toLowerCase())
      );
    }

    return NextResponse.json({ candidates, total: candidates.length });
  } catch (err) {
    console.error("[admin/candidates] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}