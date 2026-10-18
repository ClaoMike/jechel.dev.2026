import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { PageSkeleton } from '../../components/Skeleton'
import { TABS } from '../../layout/tabs'
import type { SitePage } from '../../services/api'
import { useAppSelector } from '../../store'
import { usePageVisible } from './useSite'

/** Shows a page if visitors may see it; otherwise sends them to the first one they may, or "Coming soon". */
export function VisiblePage({ page, children }: { page: SitePage; children: ReactNode }) {
  const visible = usePageVisible(page)
  const site = useAppSelector((state) => state.site)

  if (visible === null) return <PageSkeleton />
  if (visible) return <>{children}</>
  const first = site.status === 'loaded' ? TABS.find((tab) => tab.page && site.site.pages[tab.page]) : undefined
  return <Navigate to={first?.to ?? '/coming-soon'} replace />
}
