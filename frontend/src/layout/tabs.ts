export interface Tab {
  to: string
  label: string
  /** Only the signed-in admin sees it. */
  adminOnly?: boolean
}

/** The site's sections, in tab order. Each is a route rendered inside <AppLayout>. */
export const TABS: readonly Tab[] = [
  { to: '/', label: "What's new?" },
  { to: '/apps', label: 'Apps' },
  { to: '/youtube', label: 'YouTube' },
  { to: '/about', label: 'About Me' },
  { to: '/contact', label: 'Contact' },
  { to: '/engagement', label: 'Engagement', adminOnly: true },
  { to: '/community', label: 'Community', adminOnly: true },
  { to: '/terms', label: 'Terms', adminOnly: true },
]

/** Where a path sits in the tab order, or -1 when it isn't a tab (page transitions slide by this). */
export function tabIndex(pathname: string) {
  return TABS.findIndex((tab) => tab.to === pathname)
}
