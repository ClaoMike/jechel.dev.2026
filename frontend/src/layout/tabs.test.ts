import { describe, expect, it } from 'vitest'
import { tabIndex, TABS } from './tabs'

describe('tabs', () => {
  it('lists the visitor pages first, then the admin-only ones', () => {
    expect(TABS.map((t) => t.label)).toEqual(["What's new?", 'Apps', 'YouTube', 'About Me', 'Contact', 'Engagement', 'Community', 'Terms', 'Settings'])
    expect(TABS.filter((t) => t.adminOnly).every((t) => !t.page)).toBe(true)
    expect(TABS.filter((t) => !t.adminOnly).every((t) => t.page)).toBe(true)
  })

  it('knows where a path sits in the tab order', () => {
    expect(tabIndex('/')).toBe(0)
    expect(tabIndex('/about')).toBe(3)
    expect(tabIndex('/settings')).toBe(8)
    expect(tabIndex('/updates/confirm')).toBe(-1)
  })
})
