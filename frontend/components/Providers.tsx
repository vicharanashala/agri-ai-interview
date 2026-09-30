'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

import GlobalCandidateGuard from './GlobalCandidateGuard';

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <GlobalCandidateGuard>
        {children}
      </GlobalCandidateGuard>
    </SessionProvider>
  );
}