import type { SitePage } from '../services/api'
import { strings } from '../strings'

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
  { to: '/engagement', label: strings.tabs.engagement, adminOnly: true },
  { to: '/community', label: strings.tabs.community, adminOnly: true },
  { to: '/notifications', label: strings.tabs.notifications, adminOnly: true },
  { to: '/terms', label: strings.tabs.terms, adminOnly: true },
  { to: '/settings', label: strings.tabs.settings, adminOnly: true },
  { to: '/features', label: strings.tabs.featureTesting, badge: 'BETA', adminOnly: true, nested: true },
]

/** The site's sections, in tab order. Each is a route rendered inside <AppLayout>. */
export const TABS: readonly Tab[] = [
  { to: '/', label: strings.common.whatsNew, page: 'whatsNew' },
  { to: '/apps', label: strings.common.apps, page: 'apps' },
  { to: '/youtube', label: 'YouTube', page: 'youtube' },
  { to: '/about', label: strings.common.aboutMe, page: 'about' },
  { to: '/contact', label: strings.tabs.contact, page: 'contact' },
  { to: '/system', label: strings.tabs.system, adminOnly: true, sections: SYSTEM_PAGES },
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

/**
 * Where a swipe goes from this path (`next`: the page to the right, a swipe to the left): the next or previous page
 * along the tabs on show (`tabs`, as the tab bar has them), a group (System) standing for each of its pages and a
 * nested tab for each of its own (Feature Testing's `features`), so Contact's next is Engagement and Engagement's
 * previous is Contact. Nothing past either end, nor off a page that isn't on show.
 */
export function swipeTarget(pathname: string, tabs: readonly Tab[], features: readonly string[], to: 'next' | 'previous'): string | null {
  const pagesOf = (tab: Tab): string[] =>
    tab.sections ? tab.sections.flatMap(pagesOf) : tab.nested && features.length > 0 ? features.map((slug) => `${tab.to}/${slug}`) : [tab.to]
  const pages = tabs.flatMap(pagesOf)
  // A nested tab's bare address (/features) is its first page.
  const nested = tabs.flatMap((tab) => tab.sections ?? [tab]).find((tab) => tab.nested && tab.to === pathname)
  const here = pages.indexOf(nested ? (pages.find((page) => page.startsWith(`${pathname}/`)) ?? pathname) : pathname)
  if (here < 0) return null
  return pages[here + (to === 'next' ? 1 : -1)] ?? null
}
