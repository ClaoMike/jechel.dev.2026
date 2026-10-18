import type { SitePage } from '../services/api'

export interface Tab {
  to: string
  label: string
  /** Only the signed-in admin sees it. */
  adminOnly?: boolean
  /** A visitor page that can be hidden (Settings → Visitor pages). */
  page?: SitePage
}

/** The site's sections, in tab order. Each is a route rendered inside <AppLayout>. */
export const TABS: readonly Tab[] = [
  { to: '/', label: "What's new?", page: 'whatsNew' },
  { to: '/apps', label: 'Apps', page: 'apps' },
  { to: '/youtube', label: 'YouTube', page: 'youtube' },
  { to: '/about', label: 'About Me', page: 'about' },
  { to: '/contact', label: 'Contact', page: 'contact' },
  { to: '/engagement', label: 'Engagement', adminOnly: true },
  { to: '/community', label: 'Community', adminOnly: true },
  { to: '/terms', label: 'Terms', adminOnly: true },
  { to: '/settings', label: 'Settings', adminOnly: true },
]

/** Where a path sits in the tab order, or -1 when it isn't a tab (page transitions slide by this). */
export function tabIndex(pathname: string) {
  return TABS.findIndex((tab) => tab.to === pathname)
}
