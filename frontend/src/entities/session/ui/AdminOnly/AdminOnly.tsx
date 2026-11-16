import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAppSelector } from '@/shared/lib/store'
import { PageSkeleton } from '@/shared/ui/Skeleton'

/** An admin-only tab: placeholders while the session is checked, then the page; visitors who open the URL go home. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const status = useAppSelector((state) => state.auth.status)

  if (status === 'loading') return <PageSkeleton />
  if (status === 'anonymous') return <Navigate to="/" replace />
  return <>{children}</>
}
