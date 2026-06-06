'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Phase 4 is now "Upload Documents" — the /signing page redirects to dashboard
export default function SigningPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}