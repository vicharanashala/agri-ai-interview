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

    // Fetch score from the most recent completed InterviewSession
    const latestSession = await prisma.interviewSession.findFirst({
      where: {
        candidateId: user.candidate.id,
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
    })
    const score = latestSession?.score ?? null

    // Fetch the most recent InterviewQueueEntry that has a cooldown set
    // (new interview attempts create a fresh entry with no cooldownUntil,
    // so we must explicitly filter for entries that actually have one)
    const latestQueueEntry = await prisma.interviewQueueEntry.findFirst({
      where: {
        candidateId: user.candidate.id,
        cooldownUntil: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    })
    const cooldownUntil = latestQueueEntry?.cooldownUntil
      ? (latestQueueEntry.cooldownUntil as Date).toISOString()
      : null

    const attempts = user.candidate.interviewSessions
      .filter((s: { status: string }) => s.status === 'completed')
      .map((s: { id: string; status: string; result: string | null; score: number | null; completedAt: Date | null }) => {
        return {
          id: s.id,
          status: s.status,
          overall_score: s.score,
          result: s.result,
          completedAt: s.completedAt?.toISOString() ?? null,
        }
      })
      .sort((a: { completedAt: string | null }, b: { completedAt: string | null }): number => {
        if (!a.completedAt) return 1
        if (!b.completedAt) return -1
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      })

    // Read admin-set cooldown days from Settings table
    let cooldownDays = 3; // default fallback
    if (cooldownUntil) {
      const setting = await prisma.settings.findFirst({
        where: { key: "interview_cooldown_days" },
      });
      if (setting && setting.value) {
        cooldownDays = parseInt(String(setting.value), 10);
      }
    }

    return NextResponse.json({ attempts, cooldownUntil, cooldownDays });
  } catch (error) {
    console.error('[candidate/attempts] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}