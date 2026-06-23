import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth-options'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { candidate: { include: { interviewSessions: true } } },
    })

    if (!user?.candidate) {
      return NextResponse.json({ attempts: [], cooldownUntil: null })
    }

    // Read admin-set cooldown days from Settings table (always live, never stale)
    const setting = await prisma.settings.findFirst({
      where: { key: "interview_cooldown_days" },
    })
    const cooldownDays = setting?.value ? parseInt(String(setting.value), 10) : 3

    // Cooldown deadline is computed dynamically from the most recent FAILED
    // InterviewSession.startedAt + current cooldown_days setting.
    // Order by startedAt desc to always target the latest session, even if
    // completedAt was previously cleared by a reset-cooldown operation.
    const latestFailedSession = await prisma.interviewSession.findFirst({
      where: {
        candidateId: user.candidate.id,
        status: 'completed',
        result: 'FAIL',
      },
      orderBy: { startedAt: 'desc' },
    })

    let cooldownUntil: string | null = null
    if (latestFailedSession?.completedAt) {
      const failedAtMs = new Date(latestFailedSession.completedAt).getTime()
      const deadlineMs = failedAtMs + cooldownDays * 24 * 60 * 60 * 1000
      if (deadlineMs > Date.now()) {
        cooldownUntil = new Date(deadlineMs).toISOString()
      }
      // If deadline has passed or completedAt is null, cooldownUntil is null → candidate can retry
    }

    const attempts = user.candidate.interviewSessions
      .filter((s: { status: string }) => s.status === 'completed')
      .map((s: { id: string; status: string; result: string | null; score: number | null; completedAt: Date | null; startedAt: Date | null }) => {
        return {
          id: s.id,
          status: s.status,
          overall_score: s.score,
          result: s.result,
          completedAt: s.completedAt?.toISOString() ?? null,
          startedAt: s.startedAt?.toISOString() ?? null,
        }
      })
      .sort((a: { startedAt: string | null }, b: { startedAt: string | null }): number => {
        if (!a.startedAt) return 1
        if (!b.startedAt) return -1
        return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      })

    return NextResponse.json({ attempts, cooldownUntil, cooldownDays });
  } catch (error) {
    console.error('[candidate/attempts] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}