'use client';

import { Suspense, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

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
    fetch('/api/candidate', { credentials: 'include' })
      .then((res) => {
        console.log('[post-login] /api/candidate status:', res.status);
        if (res.ok) return res.json();
        throw new Error('No candidate');
      })
      .then(async (candidate: { id?: string; currentPhase?: string }) => {
        console.log('[post-login] candidate found:', candidate?.id, 'phase:', candidate?.currentPhase);
        const phase = candidate?.currentPhase;

        // Step 2: Establish Redis session with backend (single-session enforcement).
        // This must happen before any interview/queue API calls are made.
        // If candidate record doesn't exist yet, skip session creation (onboarding).
        if (candidate?.id && session?.user?.email) {
          console.log('[post-login] Creating backend session for', session.user.email);
          try {
            const res = await fetch('/api/candidate/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                candidate_id: candidate.id,
                email: session.user.email,
              }),
            });
            const data = await res.json();
            console.log('[post-login] session response:', res.status, 'token?', !!data.token);
            if (data.token) {
              // Store in sessionStorage — cleared on tab close
              sessionStorage.setItem('candidate_session_token', data.token)
              sessionStorage.setItem('candidate_id', candidate.id ?? '')
              console.log('[post-login] Token stored, first 8:', data.token.substring(0, 8));
            } else {
              console.warn('[post-login] No token in session response:', JSON.stringify(data));
            }
          } catch (e) {
            console.warn('[post-login] Failed to create backend session', e);
          }
        } else {
          console.log('[post-login] No candidate.id or no email — skipping session creation');
        }

        // Step 3: Navigate to appropriate page
        // We MUST wait for session creation before navigating —
        // otherwise /interview page loads before candidate_session_token is in sessionStorage
        // callbackUrl takes priority (e.g. /interview from dashboard's Start Interview)
        if (callbackUrl) {
          console.log('[post-login] Navigating to callbackUrl:', callbackUrl);
          router.replace(callbackUrl);
        } else {
          console.log('[post-login] Navigating to:', phase && phase !== 'onboarding' ? '/dashboard' : '/onboarding');
          if (phase && phase !== 'onboarding') {
            router.replace('/dashboard');
          } else {
            router.replace('/onboarding');
          }
        }
      })
      .catch((err) => {
        console.log('[post-login] /api/candidate failed, redirecting to /onboarding', err);
        // No candidate record yet — send to onboarding (no session needed yet)
        router.replace('/onboarding');
      });
  }, [session, status, callbackUrl, router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif',
      color: '#666',
    }}>
      Redirecting...
    </div>
  );
}

export default function PostLoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: '#666',
      }}>
        Loading...
      </div>
    }>
      <PostLoginContent />
    </Suspense>
  );
}