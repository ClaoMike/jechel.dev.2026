import type { SitePage } from '../services/api'

export interface Tab {
  to: string
  label: string
  /** Only the signed-in admin sees it. */
  adminOnly?: boolean
  /** A visitor page that can be hidden (Settings → Visitor pages). */
  page?: SitePage
  /** A small label after the name, e.g. BETA. */
  badge?: string
  /** It has pages of its own under it (e.g. /features/…), which keep the tab marked as current. */
  nested?: boolean
  /** It groups these pages (System): it opens the first, and is current on any of them, which have a navigation of their own. */
  sections?: readonly Tab[]
}

/** The admin's pages, under System: each at its own address, with System's navigation above it. */
export const SYSTEM_PAGES: readonly Tab[] = [
  { to: '/engagement', label: 'Engagement', adminOnly: true },
  { to: '/community', label: 'Community', adminOnly: true },
  { to: '/notifications', label: 'Notifications', adminOnly: true },
  { to: '/terms', label: 'Terms', adminOnly: true },
  { to: '/settings', label: 'Settings', adminOnly: true },
  { to: '/features', label: 'Feature Testing', badge: 'BETA', adminOnly: true, nested: true },
]

/** The site's sections, in tab order. Each is a route rendered inside <AppLayout>. */
export const TABS: readonly Tab[] = [
  { to: '/', label: "What's new?", page: 'whatsNew' },
  { to: '/apps', label: 'Apps', page: 'apps' },
  { to: '/youtube', label: 'YouTube', page: 'youtube' },
  { to: '/about', label: 'About Me', page: 'about' },
  { to: '/contact', label: 'Contact', page: 'contact' },
  { to: '/system', label: 'System', adminOnly: true, sections: SYSTEM_PAGES },
]

/** Whether the tab is the one on show at that path: its own page, the pages under it (nested), or one it groups. */
export function isCurrent(tab: Tab, pathname: string): boolean {
  if (tab.sections) return tab.sections.some((section) => isCurrent(section, pathname))
  return tab.to === pathname || (!!tab.nested && pathname.startsWith(`${tab.to}/`))
}

/** Where the tab's link goes: a group's first page. */
export function linkOf(tab: Tab): string {
  return tab.sections?.[0]?.to ?? tab.to
}

/**
 * Where a path sits in the tab order, or -1 when it isn't a tab (page transitions slide by this). A page in a group
 * sits within its tab, in the group's order (System's Engagement is 5.01, Community 5.02).
 */
export function tabIndex(pathname: string) {
  for (const [index, tab] of TABS.entries()) {
    if (!isCurrent(tab, pathname)) continue
    const section = tab.sections?.findIndex((s) => isCurrent(s, pathname)) ?? -1
    return section >= 0 ? index + (section + 1) / 100 : index
  }
  return -1
}
