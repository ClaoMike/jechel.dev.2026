import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { stubApi } from '@/test/api'
import { SITE } from '@/test/fixtures/site'
import { ADMIN, forever, renderApp, shootWhole } from '@/test/render'

const tabs = () => page.getByRole('navigation', { name: 'Sections' })

/** Engagement (System's first page) loads its figures: here they stay loading. */
function holdEngagement() {
  vi.spyOn(api.analytics, 'summary').mockImplementation(forever)
  vi.spyOn(api.analytics, 'listSessions').mockImplementation(forever)
}

describe('the site, as a visitor gets it', () => {
  it('opens on the page in the address, inside the frame', async () => {
    stubApi()
    const app = await renderApp({ path: '/youtube' })
    await expect.element(page.getByRole('list', { name: 'Videos' })).toBeVisible()
    await expect.element(tabs().getByRole('link', { name: 'YouTube' })).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => app.location()).toBe('/youtube')
  })

  it("keeps the names out of the browser's translation (the site's, and the Vice mark), not the tabs or a video's title", async () => {
    stubApi()
    await renderApp({ path: '/youtube' })
    await expect.element(page.getByRole('list', { name: 'Videos' })).toBeVisible()
    expect(page.getByRole('heading', { name: 'jechel.dev' }).element().getAttribute('translate')).toBe('no')
    expect(document.querySelector('.vice-mark')!.getAttribute('translate')).toBe('no')
    expect(tabs().element().closest('[translate]')).toBeNull()
    expect(document.querySelector('.media-card-title')!.closest('[translate]')).toBeNull()
  })

  it('sends an unknown address home', async () => {
    stubApi()
    const app = await renderApp({ path: '/nowhere' })
    await expect.element(tabs().getByRole('link', { name: "What's new?" })).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => app.location()).toBe('/')
  })

  it('moves between pages with the tabs', async () => {
    stubApi()
    const app = await renderApp()
    await tabs().getByRole('link', { name: 'About Me' }).click()
    await expect.element(page.getByRole('region', { name: 'Skills' })).toBeVisible()
    await expect.poll(() => app.location()).toBe('/about')
  })

  it('shows the maintenance screen (with its message) instead of the pages, keeping the name and themes', async () => {
    const api = stubApi()
    api.site.status.mockResolvedValue({ ...SITE, maintenance: true, maintenanceMessage: 'Back at 6pm.' })
    await renderApp({ path: '/apps' })
    await expect.element(page.getByRole('heading', { name: "We'll be right back" })).toBeVisible()
    await expect.element(page.getByText('Back at 6pm.')).toBeVisible()
    await expect.element(tabs()).not.toBeInTheDocument()
    await expect.element(page.getByRole('group', { name: 'Theme' })).toBeVisible()
    await expect.element(page.getByRole('link', { name: /Buy me a coffee/ })).not.toBeInTheDocument()
    await expect.element(page.getByRole('contentinfo')).not.toBeInTheDocument()
    expect(api.apps.list).not.toHaveBeenCalled()
    expect(api.apps.whatsNew).not.toHaveBeenCalled()
  })

  it('has a default maintenance message, and checks again on "Try again"', async () => {
    const api = stubApi()
    api.site.status.mockResolvedValue({ ...SITE, maintenance: true })
    await renderApp()
    await expect.element(page.getByText('The site is having some work done. Please check back soon.')).toBeVisible()
    api.site.status.mockResolvedValue(structuredClone(SITE))
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(tabs()).toBeVisible()
  })

  it("says so when the site can't be reached at all", async () => {
    const api = stubApi()
    api.site.status.mockRejectedValue(new ApiError('/api/site', 0))
    await renderApp()
    await expect.element(page.getByRole('heading', { name: "Can't reach the site right now" })).toBeVisible()
    await expect.element(page.getByText('It may be down for a moment. This page checks again every half a minute and comes back by itself.')).toBeVisible()
  })

  it('still lets the admin sign in, and opens the email links, during maintenance', async () => {
    const api = stubApi()
    api.site.status.mockResolvedValue({ ...SITE, maintenance: true })
    const signIn = await renderApp({ path: '/admin/' })
    await expect.element(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
    await signIn.unmount()
    await renderApp({ path: '/updates/unsubscribe?token=abc' })
    await expect.element(page.getByText("You're unsubscribed: no more emails. Sorry to see you go.")).toBeVisible()
  })

  it('shows the frame while the site and the session load', async () => {
    const api = stubApi()
    api.site.status.mockReturnValue(forever())
    await renderApp()
    await expect.element(page.getByRole('heading', { name: 'jechel.dev' })).toBeVisible()
    await expect.element(page.getByRole('status')).toBeInTheDocument()
  })

  it('leaves out hidden pages: their tabs, and their addresses go to the first visible page', async () => {
    const api = stubApi()
    api.site.status.mockResolvedValue({ ...SITE, pages: { ...SITE.pages, whatsNew: false, youtube: false } })
    const app = await renderApp({ path: '/youtube' })
    await expect.element(tabs().getByRole('link', { name: 'Apps' })).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => app.location()).toBe('/apps')
    expect(
      tabs()
        .getByRole('link')
        .elements()
        .map((a) => a.textContent),
    ).toEqual(['Apps', 'About Me', 'Contact'])
  })

  it('says "Coming soon" when every page is hidden', async () => {
    const api = stubApi()
    api.site.status.mockResolvedValue({ ...SITE, pages: { whatsNew: false, apps: false, youtube: false, about: false, contact: false } })
    const app = await renderApp({ path: '/about' })
    await expect.element(page.getByRole('heading', { name: 'Coming soon' })).toBeVisible()
    await expect.poll(() => app.location()).toBe('/coming-soon')
  })

  it('keeps visitors out of the admin pages', async () => {
    stubApi()
    const app = await renderApp({ path: '/settings' })
    await expect.element(tabs().getByRole('link', { name: "What's new?" })).toHaveAttribute('aria-current', 'page')
    await expect.poll(() => app.location()).toBe('/')
  })
})

describe('the site, for the signed-in admin', () => {
  it("shows every page, hidden ones marked, and System (the admin's pages); never the maintenance screen", async () => {
    const api = stubApi({ user: ADMIN })
    api.site.status.mockResolvedValue({ ...SITE, maintenance: true, pages: { ...SITE.pages, youtube: false } })
    await renderApp({ path: '/youtube' })
    await expect.element(page.getByRole('list', { name: 'Videos' })).toBeVisible()
    expect(
      tabs()
        .getByRole('link')
        .elements()
        .map((a) => a.textContent),
    ).toEqual(["What's new?", 'Apps', 'YouTube (hidden from visitors)', 'About Me', 'Contact', 'System'])
    await expect.element(tabs().getByRole('link', { name: /YouTube/ })).toHaveAttribute('title', 'Hidden from visitors')
  })

  it("groups the admin's pages under System: its tab opens the first, and its own row moves between them, each at its own address", async () => {
    stubApi({ user: ADMIN })
    holdEngagement()
    const app = await renderApp({ path: '/' })
    const system = () => page.getByRole('navigation', { name: 'System' })
    expect(system().query()).toBeNull()

    await tabs().getByRole('link', { name: 'System' }).click()
    await expect.poll(() => app.location()).toBe('/engagement')
    await expect.element(tabs().getByRole('link', { name: 'System' })).toHaveAttribute('aria-current', 'page')
    expect(
      system()
        .getByRole('link')
        .elements()
        .map((a) => a.textContent),
    ).toEqual(['Engagement', 'Community', 'Notifications', 'Terms', 'Settings', 'Feature Testing BETA'])
    await expect.element(system().getByRole('link', { name: 'Engagement' })).toHaveAttribute('aria-current', 'page')

    await system().getByRole('link', { name: 'Terms' }).click()
    await expect.poll(() => app.location()).toBe('/terms')
    await expect.element(system().getByRole('link', { name: 'Terms' })).toHaveAttribute('aria-current', 'page')
    await expect.element(system().getByRole('link', { name: 'Engagement' })).not.toHaveAttribute('aria-current')
    await expect.element(tabs().getByRole('link', { name: 'System' })).toHaveAttribute('aria-current', 'page')
  })

  it("opens System's first page from its own address, /system", async () => {
    stubApi({ user: ADMIN })
    holdEngagement()
    const app = await renderApp({ path: '/system' })
    await expect.poll(() => app.location()).toBe('/engagement')
  })
})

describe("System's row, for visitors", () => {
  it("isn't there: not on the terms page they can read, nor anywhere else", async () => {
    stubApi()
    await renderApp({ path: '/terms' })
    await expect.element(page.getByRole('heading', { name: 'Terms and Conditions' })).toBeVisible()
    expect(page.getByRole('navigation', { name: 'System' }).query()).toBeNull()
    expect(tabs().getByRole('link', { name: 'System' }).query()).toBeNull()
  })
})

describe('the web app saved to the Home Screen', () => {
  // The page's own <link rel="manifest"> (index.html), which the tests' page doesn't have.
  const manifestLink = () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'manifest' }))
    link.setAttribute('href', '/manifest.webmanifest')
    return link
  }

  it("is the visitors' one on the site's pages", async () => {
    const link = manifestLink()
    stubApi()
    await renderApp({ path: '/youtube' })
    await expect.element(page.getByRole('list', { name: 'Videos' })).toBeVisible()
    expect(link.getAttribute('href')).toBe('/manifest.webmanifest')
  })

  it("is the admin's own on the sign-in, so it opens there", async () => {
    const link = manifestLink()
    stubApi()
    await renderApp({ path: '/admin' })
    await expect.element(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
    expect(link.getAttribute('href')).toBe('/admin.webmanifest')
  })

  it("is the admin's own on every page while the admin is signed in", async () => {
    const link = manifestLink()
    stubApi({ user: ADMIN })
    await renderApp({ path: '/youtube' })
    await expect.element(page.getByRole('list', { name: 'Videos' })).toBeVisible()
    await expect.poll(() => link.getAttribute('href')).toBe('/admin.webmanifest')
  })
})

describe('the site frame, screenshots and accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: visitor and admin, on a desktop and a phone`, async () => {
      stubApi()
      const visitor = await renderApp({ theme, path: '/apps' })
      await expect.element(page.getByRole('list', { name: 'Apps' })).toBeVisible()
      await expect.element(page.getByRole('link', { name: /Buy me a coffee/ })).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('banner'), `${theme}-header-visitor`)
      await shootWhole(page.getByRole('contentinfo'), `${theme}-footer`)
      await visitor.unmount()

      stubApi({ user: ADMIN })
      const admin = await renderApp({ theme, path: '/apps' })
      await expect.element(page.getByText('Signed in as admin@example.com')).toBeVisible()
      await expect.element(page.getByRole('link', { name: /Buy me a coffee/ })).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('banner'), `${theme}-header-admin`)
      await admin.unmount()

      await page.viewport(390, 844)
      try {
        stubApi()
        await renderApp({ theme, path: '/apps' })
        await expect.element(page.getByRole('link', { name: /Buy me a coffee/ })).toBeVisible()
        expect(await a11yViolations()).toEqual([])
        await shootWhole(page.getByRole('banner'), `${theme}-header-phone`)
      } finally {
        await page.viewport(1280, 900)
      }
    })

    it(`${theme}: the maintenance screen`, async () => {
      const api = stubApi()
      api.site.status.mockResolvedValue({ ...SITE, maintenance: true, maintenanceMessage: 'Back at 6pm.' })
      await renderApp({ theme })
      await expect.element(page.getByRole('heading', { name: "We'll be right back" })).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-maintenance`)
      // The name stays: read out once, though it's drawn in layers.
      await expect.element(page.getByRole('heading', { level: 1, name: 'jechel.dev', exact: true })).toBeVisible()
    })
  }
})
