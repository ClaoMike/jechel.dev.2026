import { describe, expect, it } from 'vitest'
import { tabIndex, TABS } from './tabs'

describe('tabs', () => {
  it('lists the visitor pages first, then the admin-only ones', () => {
    expect(TABS.map((t) => t.label)).toEqual(["What's new?", 'Apps', 'YouTube', 'About Me', 'Contact', 'Engagement', 'Community', 'Notifications', 'Terms', 'Settings', 'Feature Testing'])
    expect(TABS.filter((t) => t.adminOnly).every((t) => !t.page)).toBe(true)
    expect(TABS.filter((t) => !t.adminOnly).every((t) => t.page)).toBe(true)
  })

  it('knows where a path sits in the tab order', () => {
    expect(tabIndex('/')).toBe(0)
    expect(tabIndex('/about')).toBe(3)
    expect(tabIndex('/notifications')).toBe(7)
    expect(tabIndex('/settings')).toBe(9)
    expect(tabIndex('/features')).toBe(10)
    // A tab's own pages under it count as the tab; another tab's look-alike address doesn't.
    expect(tabIndex('/features/work-with-me')).toBe(10)
    expect(tabIndex('/settings/x')).toBe(-1)
    expect(tabIndex('/featuresx')).toBe(-1)
    expect(tabIndex('/updates/confirm')).toBe(-1)
  })
})
