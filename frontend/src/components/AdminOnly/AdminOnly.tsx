import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAdminOnlyViewModel } from './AdminOnly.viewModel'
import { PageSkeleton } from '../Skeleton'

/** An admin-only tab: placeholders while the session is checked, then the page; visitors who open the URL go home. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const vm = useAdminOnlyViewModel()

  if (vm.status === 'loading') return <PageSkeleton />
  if (vm.status === 'anonymous') return <Navigate to="/" replace />
  return <>{children}</>
}
