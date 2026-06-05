'use client'

import { usePathname } from 'next/navigation'
import { usePlatformIdleTimer } from '@/hooks/usePlatformIdleTimer'

export default function IdleTimerWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Only enable on candidate-facing pages.
  // /interview has its own anti-cheat idle; /admin has separate auth.
  const enabled = !pathname?.startsWith('/interview') && !pathname?.startsWith('/admin')

  usePlatformIdleTimer({ enabled })

  return <>{children}</>
}