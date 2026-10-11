/** The site's sections, in tab order. Each is a route rendered inside <AppLayout>. */
export const TABS = [
  { to: '/', label: "What's new?" },
  { to: '/apps', label: 'Apps' },
  { to: '/youtube', label: 'YouTube' },
  { to: '/about', label: 'About Me' },
  { to: '/contact', label: 'Contact' },
] as const

/** Where a path sits in the tab order, or -1 when it isn't a tab (page transitions slide by this). */
export function tabIndex(pathname: string) {
  return TABS.findIndex((tab) => tab.to === pathname)
}
