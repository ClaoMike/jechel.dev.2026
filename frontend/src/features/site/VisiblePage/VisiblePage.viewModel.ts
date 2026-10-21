import { TABS } from '../../../layout/tabs'
import type { SitePage } from '../../../services/api'
import { useAppSelector } from '../../../store'
import { usePageVisible } from '../useSite'

/** Shows the page, waits (null), or names where to send the visitor: the first page they may see, or "Coming soon". */
export function useVisiblePageViewModel(page: SitePage): { show: boolean | null; redirectTo: string } {
  const visible = usePageVisible(page)
  const site = useAppSelector((state) => state.site)
  const first = site.status === 'loaded' ? TABS.find((tab) => tab.page && site.site.pages[tab.page]) : undefined
  return { show: visible, redirectTo: first?.to ?? '/coming-soon' }
}
