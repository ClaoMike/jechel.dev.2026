import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { PageSkeleton } from '@/shared/ui/Skeleton'
import type { SitePage } from '@/shared/api'
import { TABS } from '../../config/tabs'
import { useAppSelector } from '@/shared/lib/store'
import { usePageVisible } from '../../model/useSite'

/** Shows a page if visitors may see it (placeholders until that's known); otherwise sends them to the first one they may, or "Coming soon". */
export function VisiblePage({ page, children }: { page: SitePage; children: ReactNode }) {
  const visible = usePageVisible(page)
  const site = useAppSelector((state) => state.site)

  if (visible === null) return <PageSkeleton />
  if (visible) return <>{children}</>
  const first = site.status === 'loaded' ? TABS.find((tab) => tab.page && site.site.pages[tab.page]) : undefined
  return <Navigate to={first?.to ?? '/coming-soon'} replace />
}
