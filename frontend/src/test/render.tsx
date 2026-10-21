/**
 * Renders a view the way the site does: in the store, the router and the page's <main>, in a theme,
 * signed in or not. The API is never called: stub what the view loads with `vi.spyOn(api.…)`.
 */
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { expect } from 'vitest'
import { page, userEvent, type Locator } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import App from '../App/App'
import { showTheme, type Theme } from '../layout/theme'
import { termsVersion } from '../features/terms/acceptance'
import { TERMS } from './fixtures/site'
import type { CurrentUser, SiteStatus } from '../services/api'
import { LocationProbe } from './LocationProbe'
import { makeStore } from '../store'
import { checkSession } from '../store/authSlice'
import { fetchSite } from '../store/siteSlice'

export const ADMIN: CurrentUser = { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 3600 }

export interface RenderViewOptions {
  /** The URL the view opens at, e.g. "/apps?page=2". */
  path?: string
  /** Signed in as this user; none: a visitor. */
  user?: CurrentUser | null
  theme?: Theme
  /** What visitors may see (/api/site), as already loaded; none: not loaded (as before it answers). */
  site?: SiteStatus
}

export async function renderView(ui: ReactNode, { path = '/', user = null, theme = 'dark', site }: RenderViewOptions = {}) {
  const store = makeStore()
  store.dispatch(checkSession.fulfilled(user, 'test'))
  if (site) store.dispatch(fetchSite.fulfilled(site, 'test'))
  showTheme(theme)
  const screen = await render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <main className="page">{ui}</main>
        <LocationProbe />
        <span data-testid="mouse-rest" style={{ position: 'fixed', left: 0, top: 0, width: 2, height: 2, zIndex: 2147483647 }} />
      </MemoryRouter>
    </Provider>,
  )
  // The mouse stays where the last test left it: move it off the cards, or one is drawn hovered.
  await restMouse()
  return { ...screen, store, location: () => document.querySelector<HTMLElement>('[data-testid="location"]')!.dataset.location! }
}

/** A promise that never settles: the view stays loading. */
export const forever = <T,>() => new Promise<T>(() => {})

/** Resolves once every image on the page has loaded (or failed), so a screenshot shows them. */
export async function imagesLoaded() {
  await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))))
}

/** The text in what the locator finds ('' while it isn't there): poll it, e.g. `expect.poll(() => textOf(alert)).toContain(…)`. */
export const textOf = (locator: Locator) => locator.query()?.textContent ?? ''

/** Moves the mouse to the page's top-left corner, off everything (no hover effects in a screenshot or a measurement). */
export const restMouse = () => userEvent.hover(page.getByTestId('mouse-rest').last())

export interface RenderAppOptions {
  /** Where the site opens, e.g. "/about". */
  path?: string
  /** The theme the visitor chose (remembered in the browser, like on the site). */
  theme?: Theme
  /** The visitor accepted these terms before (so the welcome popup doesn't come up). Defaults to the current terms. */
  acceptedTerms?: string | null
}

/**
 * The whole site, as it starts in the browser (main.tsx): the store, the router, App. Stub the API
 * first (stubApi): who's signed in comes from `api.auth.me`, like on the real site.
 */
export async function renderApp({ path = '/', theme = 'dark', acceptedTerms = termsVersion(TERMS) }: RenderAppOptions = {}) {
  localStorage.setItem('theme', theme)
  if (acceptedTerms !== null) localStorage.setItem('terms.accepted', acceptedTerms)
  const store = makeStore()
  showTheme(store.getState().theme.theme)
  const screen = await render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
        <span data-testid="mouse-rest" style={{ position: 'fixed', left: 0, top: 0, width: 2, height: 2, zIndex: 2147483647 }} />
      </MemoryRouter>
    </Provider>,
  )
  await restMouse()
  return { ...screen, store, location: () => document.querySelector<HTMLElement>('[data-testid="location"]')!.dataset.location! }
}

/**
 * A screenshot of the whole element, however tall: the browser only paints what's inside its window,
 * so the window grows to fit the element first (same width), and goes back afterwards. The mouse is
 * moved off everything and the images are waited for.
 */
export async function shootWhole(locator: Locator, name: string) {
  const width = window.innerWidth
  const height = window.innerHeight
  await restMouse()
  await imagesLoaded()
  const bottom = Math.ceil(locator.element().getBoundingClientRect().bottom + window.scrollY)
  if (bottom > height) await page.viewport(width, bottom + 16)
  try {
    await expect.element(locator).toMatchScreenshot(name)
  } finally {
    if (bottom > height) await page.viewport(width, height)
  }
}
