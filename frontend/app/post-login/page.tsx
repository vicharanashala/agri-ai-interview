'use client';

import { Suspense, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import FullPageSkeleton from '@/components/FullPageSkeleton';
import { useRouter, useSearchParams } from 'next/navigation';
import { clearAuthToken, getAuthToken, setAuthToken } from '@/lib/auth-fetch';
import { ensureCandidateSession, type CandidateSessionDeps } from '@/lib/candidate-session-client';

// ── Backend session plumbing for ensureCandidateSession ──────────────────────
const sessionDeps: CandidateSessionDeps = {
  getStoredToken: getAuthToken,
  storeSession(token, candidateId) {
    setAuthToken(token);
    sessionStorage.setItem('candidate_id', candidateId);
  },
  clearStoredSession: clearAuthToken,
  async verifyToken(token) {
    const res = await fetch('/api/candidate/session/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.candidate_id ? { candidateId: String(data.candidate_id) } : null;
  },
  async createSession(candidateId, email) {
    const res = await fetch('/api/candidate/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ candidate_id: candidateId, email }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('[post-login] session response:', res.status, 'token?', !!data.token);
    return typeof data.token === 'string' && data.token ? data.token : null;
  },
};

function PostLoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  useEffect(() => {
    console.log('[post-login] effect fired: status=', status, 'session=', session?.user?.email ?? 'null');
    if (status === 'loading') return;

    // If no session at all, go to login
    if (!session) {
      console.log('[post-login] no session, redirect to /login');
      router.replace('/login');
      return;
    }

    console.log('[post-login] Fetching /api/candidate...');
    // Step 1: Fetch candidate record to know phase AND to pass to session creation
    fetch('/api/candidate', { credentials: 'include', cache: 'no-store' })
      .then((res) => {
        console.log('[post-login] /api/candidate status:', res.status);
        if (res.ok) return res.json();
        throw new Error('No candidate');
      })
      .then(async (candidate: { id?: string; currentPhase?: string; declarationAccepted?: boolean }) => {
        console.log('[post-login] candidate found:', candidate?.id, 'phase:', candidate?.currentPhase);
        const phase = candidate?.currentPhase;

        // Step 2: Establish backend session.
        // A token already in this tab is reused only if it is valid AND belongs to
        // this candidate (prevents reusing a previous user's token in the same tab);
        // otherwise a fresh session is created. Concurrent effect runs share one
        // in-flight setup so only one session is created per login.
        if (candidate?.id && session?.user?.email) {
          const outcome = await ensureCandidateSession(candidate.id, session.user.email, sessionDeps);
          console.log('[post-login] backend session:', outcome);
        } else {
          // No candidate record, so no backend session can belong to this user —
          // drop any token left in this tab by a previous user.
          clearAuthToken();
          console.log('[post-login] No candidate.id or no email — skipping session creation');
        }

        if (!candidate.declarationAccepted) {
          console.log('[post-login] Candidate must accept declaration first');
          router.replace('/declaration');
        } else if (phase === 'onboarding' || !phase || !candidate.id) {
          console.log('[post-login] Force navigating new candidate to /onboarding');
          router.replace('/onboarding');
        } else if (callbackUrl) {
          console.log('[post-login] Navigating to callbackUrl:', callbackUrl);
          router.replace(callbackUrl);
        } else {
          console.log('[post-login] Navigating to /dashboard');
          router.replace('/dashboard');
        }
      })
      .catch((err) => {
        console.log('[post-login] /api/candidate failed, redirecting to /onboarding', err);
        // No candidate record yet — send to onboarding (no session needed yet)
        router.replace('/onboarding');
      });
  }, [session, status, callbackUrl, router]);

  return (
    <FullPageSkeleton />
  );
}

export default function PostLoginPage() {
  return (
    <Suspense fallback={
      <FullPageSkeleton />
    }>
      <PostLoginContent />
    </Suspense>
  );
}