import { useAppSelector } from '../store'
import { TABS, type Tab } from './tabs'

export interface ShownTab extends Tab {
  /** The admin sees hidden pages too, marked. */
  hiddenFromVisitors: boolean
}

/** The tabs on show, in order: visitors get the pages that are switched on (none until that's known); the admin, them all, hidden ones marked. */
export function useShownTabs(): ShownTab[] {
  const isAuthenticated = useAppSelector((state) => state.auth.status === 'authenticated')
  const site = useAppSelector((state) => state.site)
  const hidden = (tab: Tab) => tab.page !== undefined && site.status === 'loaded' && !site.site.pages[tab.page]
  return TABS.filter((tab) => (isAuthenticated ? true : !tab.adminOnly && site.status === 'loaded' && !hidden(tab))).map((tab) => ({
    ...tab,
    hiddenFromVisitors: isAuthenticated && hidden(tab),
  }))
}
