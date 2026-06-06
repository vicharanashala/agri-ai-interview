'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Phase 4 is now "Upload Documents" — the /offer page redirects to dashboard
export default function OfferPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}