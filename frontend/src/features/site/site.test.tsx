import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SaveSiteRequest, SiteStatus } from '../../services/api'
import { renderApp } from '../../test/render'
import { API, server, signedIn, siteStatus } from '../../test/server'
import { RETRY_MS } from './useSite'

afterEach(() => vi.useRealTimers())

const tabs = () => within(screen.getByRole('navigation', { name: 'Sections' }))

function site(patch: Partial<SiteStatus>) {
  server.use(http.get(`${API}/api/site`, () => HttpResponse.json(siteStatus(patch))))
}

describe('pages switched off', () => {
  it('are left out of the tabs, and their links lead to the first page that is on', async () => {
    site({ pages: { whatsNew: false, apps: true, youtube: false, about: true, contact: false } })
    renderApp('/youtube')

    expect(await screen.findByRole('heading', { level: 2, name: 'Apps' })).toBeInTheDocument()
    expect(tabs().getAllByRole('link').map((l) => l.textContent)).toEqual(['Apps', 'About Me'])
  })

  it('all off: visitors get "Coming soon"', async () => {
    site({ pages: { whatsNew: false, apps: false, youtube: false, about: false, contact: false } })
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Coming soon' })).toBeInTheDocument()
  })

  it('stay open to the admin, marked as hidden', async () => {
    site({ pages: { whatsNew: true, apps: false, youtube: true, about: true, contact: true } })
    server.use(signedIn())
    renderApp('/apps')

    expect(await screen.findByRole('heading', { level: 2, name: 'Apps' })).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Apps (hidden from visitors)' })).toBeInTheDocument()
  })

  it('a feature switched off hides its button, Get updates here', async () => {
    site({ features: { meetings: true, coffee: true, updates: false } })
    renderApp('/')

    await screen.findByRole('heading', { level: 2, name: "What's new?" })
    expect(screen.queryByRole('button', { name: 'Get updates by email' })).not.toBeInTheDocument()
  })
})

describe('maintenance', () => {
  it('visitors get the maintenance page, with its message', async () => {
    site({ maintenance: true, maintenanceMessage: 'Back by 18:00' })
    renderApp('/apps')

    expect(await screen.findByRole('heading', { name: "We'll be right back" })).toBeInTheDocument()
    expect(screen.getByText('Back by 18:00')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign/i })).not.toBeInTheDocument()
  })

  it('it sits in the usual frame: the name and the theme switch, but no tabs, pages, footer or header buttons', async () => {
    site({ maintenance: true })
    const user = userEvent.setup()
    renderApp('/about')

    await screen.findByRole('heading', { name: "We'll be right back" })
    expect(screen.getByRole('heading', { level: 1, name: 'jechel.dev' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Skills' })).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Get updates by email' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Light mode' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByRole('heading', { name: "We'll be right back" })).toBeInTheDocument()
  })

  it('signing in and the links in emails still work', async () => {
    site({ maintenance: true })
    server.use(http.post(`${API}/api/updates/unsubscribe`, () => new HttpResponse(null, { status: 204 })))
    renderApp('/updates/unsubscribe?token=abc')

    expect(await screen.findByRole('status')).toHaveTextContent("You're unsubscribed")
  })

  it.each(['/admin', '/admin/'])('%s, to sign in, still works', async (url) => {
    site({ maintenance: true })
    renderApp(url)

    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('the admin still sees the site, with a reminder that visitors do not', async () => {
    site({ maintenance: true })
    server.use(signedIn())
    renderApp('/apps')

    expect(await screen.findByRole('link', { name: 'Maintenance on: visitors see the maintenance page' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('heading', { level: 2, name: 'Apps' })).toBeInTheDocument()
  })

  it("when the API can't be reached, visitors get it too, and it comes back by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.get(`${API}/api/site`, () => HttpResponse.error()))
    renderApp('/')

    expect(await screen.findByRole('heading', { name: "Can't reach the site right now" })).toBeInTheDocument()

    server.use(http.get(`${API}/api/site`, () => HttpResponse.json(siteStatus())))
    await act(() => vi.advanceTimersByTimeAsync(RETRY_MS))

    expect(await screen.findByRole('heading', { level: 2, name: "What's new?" })).toBeInTheDocument()
  })
})

describe('Settings → Visitor pages', () => {
  it('saves a switch at once', async () => {
    const saved: SaveSiteRequest[] = []
    let current = siteStatus({ pages: { whatsNew: false, apps: false, youtube: false, about: false, contact: false } })
    server.use(
      signedIn(),
      http.get(`${API}/api/site`, () => HttpResponse.json(current)),
      http.put(`${API}/api/site`, async ({ request }) => {
        const body = (await request.json()) as SaveSiteRequest
        saved.push(body)
        current = { ...current, pages: { ...current.pages, ...body.pages }, maintenance: body.maintenance ?? current.maintenance }
        return HttpResponse.json(current)
      }),
      http.get(`${API}/api/settings`, () => new Promise(() => {})),
    )
    const user = userEvent.setup()
    renderApp('/settings')

    const apps = await screen.findByRole('switch', { name: 'Apps' })
    expect(apps).toHaveAttribute('aria-checked', 'false')
    await user.click(apps)

    expect(await screen.findByRole('switch', { name: 'Apps' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('switch', { name: 'Under maintenance' }))
    expect(await screen.findByRole('link', { name: /Maintenance on/ })).toBeInTheDocument()
    expect(saved).toEqual([{ pages: { apps: true } }, { maintenance: true }])
  })
})
