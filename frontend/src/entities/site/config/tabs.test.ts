import { describe, expect, it } from 'vitest'
import { isCurrent, linkOf, swipeTarget, SYSTEM_PAGES, tabIndex, TABS } from './tabs'

describe('tabs', () => {
  it('lists the visitor pages first, then System, which holds the admin-only ones', () => {
    expect(TABS.map((t) => t.label)).toEqual(["What's new?", 'Apps', 'YouTube', 'About Me', 'Contact', 'System'])
    expect(SYSTEM_PAGES.map((t) => t.label)).toEqual(['Engagement', 'Community', 'Notifications', 'Terms', 'Settings', 'Feature Testing'])
    expect([...TABS, ...SYSTEM_PAGES].filter((t) => t.adminOnly).every((t) => !t.page)).toBe(true)
    expect(TABS.filter((t) => !t.adminOnly).every((t) => t.page)).toBe(true)
  })

  it("System opens its first page, and is current on any of its pages, a feature's own too", () => {
    const system = TABS.find((t) => t.label === 'System')!
    expect(linkOf(system)).toBe('/engagement')
    expect(linkOf(TABS[0])).toBe('/')
    for (const path of ['/engagement', '/community', '/notifications', '/terms', '/settings', '/features', '/features/work-with-me']) expect(isCurrent(system, path)).toBe(true)
    for (const path of ['/', '/contact', '/system', '/settings/x', '/featuresx']) expect(isCurrent(system, path)).toBe(false)
  })

  it('knows where a path sits in the tab order, a System page within System', () => {
    expect(tabIndex('/')).toBe(0)
    expect(tabIndex('/about')).toBe(3)
    expect(tabIndex('/engagement')).toBe(5.01)
    expect(tabIndex('/notifications')).toBe(5.03)
    expect(tabIndex('/settings')).toBe(5.05)
    expect(tabIndex('/features')).toBe(5.06)
    // A tab's own pages under it count as the tab; another tab's look-alike address doesn't.
    expect(tabIndex('/features/work-with-me')).toBe(5.06)
    expect(tabIndex('/settings/x')).toBe(-1)
    expect(tabIndex('/featuresx')).toBe(-1)
    expect(tabIndex('/updates/confirm')).toBe(-1)
  })

  describe('where a swipe goes', () => {
    const FEATURES = ['work-with-me', 'dark-map']
    const next = (path: string, tabs = TABS) => swipeTarget(path, tabs, FEATURES, 'next')
    const previous = (path: string, tabs = TABS) => swipeTarget(path, tabs, FEATURES, 'previous')

    it('goes along the tabs on show, System opening its first page, nothing past either end', () => {
      expect(next('/')).toBe('/apps')
      expect(previous('/apps')).toBe('/')
      expect(previous('/')).toBeNull()
      expect(next('/contact')).toBe('/engagement')
      // Visitors' tabs: no System after Contact; a hidden page is skipped.
      const visitors = TABS.filter((t) => !t.adminOnly && t.page !== 'youtube')
      expect(next('/contact', visitors)).toBeNull()
      expect(next('/apps', visitors)).toBe('/about')
      expect(previous('/about', visitors)).toBe('/apps')
    })

    it("goes through System's pages and each feature in turn, Engagement and Contact either side of each other, stopping at the end", () => {
      expect(next('/engagement')).toBe('/community')
      expect(previous('/engagement')).toBe('/contact')
      expect(previous('/community')).toBe('/engagement')
      expect(next('/settings')).toBe('/features/work-with-me')
      expect(next('/features')).toBe('/features/dark-map')
      expect(next('/features/work-with-me')).toBe('/features/dark-map')
      expect(previous('/features/work-with-me')).toBe('/settings')
      expect(previous('/features/dark-map')).toBe('/features/work-with-me')
      expect(next('/features/dark-map')).toBeNull()
      // With no features, Feature Testing is one page.
      expect(swipeTarget('/settings', TABS, [], 'next')).toBe('/features')
      expect(swipeTarget('/features', TABS, [], 'next')).toBeNull()
      expect(swipeTarget('/features', TABS, [], 'previous')).toBe('/settings')
    })

    it("goes nowhere off a page that isn't on show, or a feature that isn't listed", () => {
      expect(next('/updates/confirm')).toBeNull()
      expect(
        next(
          '/terms',
          TABS.filter((t) => !t.adminOnly),
        ),
      ).toBeNull()
      expect(next('/features/gone')).toBeNull()
    })
  })
})
