import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { PageSkeleton } from '../../../components/Skeleton'
import type { SitePage } from '../../../services/api'
import { useVisiblePageViewModel } from './VisiblePage.viewModel'

/** Shows a page if visitors may see it; otherwise sends them to the first one they may, or "Coming soon". */
export function VisiblePage({ page, children }: { page: SitePage; children: ReactNode }) {
  const vm = useVisiblePageViewModel(page)

  if (vm.show === null) return <PageSkeleton />
  if (vm.show) return <>{children}</>
  return <Navigate to={vm.redirectTo} replace />
}
