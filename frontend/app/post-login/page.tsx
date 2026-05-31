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
    if (status === 'loading') return;

    // If no session at all, go to login
    if (!session) {
      router.replace('/login');
      return;
    }

    // If there's a callbackUrl (e.g. from middleware protecting a specific route),
    // honour it — the user was explicitly trying to go somewhere
    if (callbackUrl) {
      router.replace(callbackUrl);
      return;
    }

    // No callbackUrl — check candidate phase to decide where to send them
    fetch('/api/candidate', { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('No candidate');
      })
      .then((candidate: { currentPhase?: string }) => {
        const phase = candidate?.currentPhase;
        if (phase && phase !== 'onboarding') {
          router.replace('/dashboard');
        } else {
          router.replace('/onboarding');
        }
      })
      .catch(() => {
        // No candidate record yet — send to onboarding
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