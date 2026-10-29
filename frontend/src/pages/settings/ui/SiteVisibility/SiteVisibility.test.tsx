import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError, type SiteStatus } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { SITE, SUPPORT_URL } from '@/test/fixtures/site'
import { ADMIN, forever, renderView, textOf } from '@/test/render'
import { SiteVisibility } from './SiteVisibility'

// Settings → Visitor pages: switching pages and features on and off, and maintenance.

const ALL_OFF: SiteStatus = { ...SITE, pages: { whatsNew: false, apps: false, youtube: false, about: false, contact: false } }

function stub(site: SiteStatus = SITE) {
  // Asked to know whether Buy me a coffee has a page link.
  vi.spyOn(api.support, 'get').mockResolvedValue({ url: SUPPORT_URL })
  return {
    status: vi.spyOn(api.site, 'status').mockResolvedValue(structuredClone(site)),
    save: vi.spyOn(api.site, 'save').mockImplementation(async (changes) => ({
      ...structuredClone(site),
      pages: { ...site.pages, ...changes.pages },
      features: { ...site.features, ...changes.features },
      maintenance: changes.maintenance ?? site.maintenance,
      maintenanceMessage: changes.maintenanceMessage ?? site.maintenanceMessage,
    })),
  }
}

/** The panel as the Settings tab shows it, once /api/site has answered. */
async function show(site: SiteStatus = SITE) {
  return renderView(<SiteVisibility />, { user: ADMIN, site })
}

const toggle = (name: string) => page.getByRole('switch', { name })

describe('Settings → Visitor pages', () => {
  it('shows each page and feature with whether visitors see it, and maintenance', async () => {
    stub()
    await show({ ...SITE, pages: { ...SITE.pages, apps: false } })
    await expect.element(toggle("What's new?")).toHaveAttribute('aria-checked', 'true')
    await expect.element(toggle('Apps')).toHaveAttribute('aria-checked', 'false')
    // Just the switches: no descriptions under them or above them.
    await expect.element(toggle('Get updates')).not.toHaveAttribute('aria-describedby')
    expect(document.querySelector('.site-visibility')!.textContent).not.toMatch(/What visitors can see|needs Resend|maintenance page instead/)
    await expect.element(toggle('Under maintenance')).toHaveAttribute('aria-checked', 'false')
  })

  it('switches a page off, saving only that change, and shows what was saved', async () => {
    const api = stub()
    await show()

    await toggle('YouTube').click()

    expect(api.save).toHaveBeenCalledWith({ pages: { youtube: false } })
    await expect.element(toggle('YouTube')).toHaveAttribute('aria-checked', 'false')
  })

  it('switches a feature on', async () => {
    const api = stub({ ...SITE, features: { ...SITE.features, updates: false } })
    await show({ ...SITE, features: { ...SITE.features, updates: false } })

    await toggle('Get updates').click()

    expect(api.save).toHaveBeenCalledWith({ features: { updates: true } })
    await expect.element(toggle('Get updates')).toHaveAttribute('aria-checked', 'true')
  })

  it('switches Work with me on and off, like the other features', async () => {
    const off = { ...SITE, features: { ...SITE.features, workWithMe: false } }
    const api = stub(off)
    await show(off)
    await expect.element(toggle('Work with me')).toHaveAttribute('aria-checked', 'false')

    await toggle('Work with me').click()

    expect(api.save).toHaveBeenCalledWith({ features: { workWithMe: true } })
    await expect.element(toggle('Work with me')).toHaveAttribute('aria-checked', 'true')
  })

  it("can't be switched again while saving", async () => {
    const api = stub()
    api.save.mockReturnValue(forever())
    await show()

    await toggle('Apps').click()

    await expect.element(toggle('Apps')).toBeDisabled()
  })

  it("says when a change couldn't be saved, keeping the switch as it was", async () => {
    const api = stub()
    api.save.mockRejectedValue(new ApiError('/api/site', 500))
    await show()

    await toggle('Apps').click()

    await expect.poll(() => textOf(page.getByRole('alert'))).toBe("That couldn't be saved. Please try again.")
    await expect.element(toggle('Apps')).toHaveAttribute('aria-checked', 'true')
  })

  it("says when Buy me a coffee is on but visitors can't see it: there's no page link yet", async () => {
    const note = "Visitors don't see the button yet: it needs a page link (Buy Me a Coffee, below)."
    stub()
    const support = vi.spyOn(api.support, 'get').mockResolvedValue({ url: '' })
    const view = await show({ ...SITE, features: { ...SITE.features, coffee: true } })
    await expect.element(toggle('Buy me a coffee')).toHaveAccessibleDescription(note)
    expect(await a11yViolations()).toEqual([])
    await view.unmount()

    // With a link, or switched off: nothing to say.
    support.mockResolvedValue({ url: 'https://buymeacoffee.com/me' })
    const linked = await show({ ...SITE, features: { ...SITE.features, coffee: true } })
    await expect.element(toggle('Buy me a coffee')).toHaveAttribute('aria-checked', 'true')
    await expect.element(page.getByText(note)).not.toBeInTheDocument()
    await linked.unmount()

    support.mockResolvedValue({ url: '' })
    await show({ ...SITE, features: { ...SITE.features, coffee: false } })
    await expect.element(toggle('Buy me a coffee')).toHaveAttribute('aria-checked', 'false')
    await expect.element(page.getByText(note)).not.toBeInTheDocument()
  })

  it('warns that visitors get "Coming soon" when every page is off', async () => {
    stub(ALL_OFF)
    await show(ALL_OFF)
    await expect.poll(() => textOf(page.getByRole('region', { name: 'Visitor pages' }))).toContain('With every page off, visitors get "Coming soon".')
  })

  it('turns maintenance on, and saves its message (trimmed) only once it changed', async () => {
    const api = stub()
    await show()
    const message = page.getByRole('textbox', { name: 'Message on the maintenance page (optional)' })
    const saveMessage = page.getByRole('button', { name: 'Save' })

    await toggle('Under maintenance').click()
    expect(api.save).toHaveBeenCalledWith({ maintenance: true })
    await expect.element(saveMessage).toBeDisabled()

    await message.fill('  Back by 18:00  ')
    await expect.element(saveMessage).toBeEnabled()
    await saveMessage.click()

    expect(api.save).toHaveBeenLastCalledWith({ maintenanceMessage: 'Back by 18:00' })
  })

  it("shows placeholders until it's known, and a retry when /api/site can't be reached", async () => {
    const api = stub()
    const loading = await renderView(<SiteVisibility />, { user: ADMIN })
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading the visitor pages…')
    await loading.unmount()

    api.status.mockRejectedValueOnce(new ApiError('/api/site', 503))
    const failed = await renderView(<SiteVisibility />, { user: ADMIN })
    const { fetchSite } = await import('@/entities/site')
    await failed.store.dispatch(fetchSite())
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The visitor pages couldn't be loaded.")
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(toggle('Apps')).toBeVisible()
  })

  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      stub()
      await renderView(<SiteVisibility />, { user: ADMIN, site: SITE, theme })
      await expect.element(toggle('Apps')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
