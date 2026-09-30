'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const PROTECTED_CANDIDATE_ROUTES = [
  '/dashboard',
  '/interview',
  '/onboarding',
  '/foundation-course',
  '/upload-documents',
  '/summary',
  '/profile',
  '/joining',
  '/signing',
  '/offer'
];

export default function GlobalCandidateGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  
  useEffect(() => {
    // Only run on protected candidate routes
    const isProtected = PROTECTED_CANDIDATE_ROUTES.some(route => pathname?.startsWith(route));
    if (!isProtected || status !== 'authenticated') return;

    const checkDeclaration = async () => {
      try {
        const res = await fetch('/api/candidate');
        if (res.ok) {
          const cand = await res.json();
          if (cand && cand.declarationAccepted === false) {
            console.log('[GlobalGuard] Candidate has not accepted declaration, redirecting...');
            router.replace('/declaration');
          }
        }
      } catch (err) {
        console.error('[GlobalGuard] Error checking candidate declaration status:', err);
      }
    };

    checkDeclaration();
  }, [pathname, status, router]);

  return <>{children}</>;
}
