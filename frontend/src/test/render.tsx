/**
 * Renders a view the way the site does: in the store, the router and the page's <main>, in a theme,
 * signed in or not. The API is never called: stub what the view loads with `vi.spyOn(api.…)`.
 */
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { page, userEvent, type Locator } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { showTheme, type Theme } from '../layout/theme'
import type { CurrentUser } from '../services/api'
import { LocationProbe } from './LocationProbe'
import { makeStore } from '../store'
import { checkSession } from '../store/authSlice'

export const ADMIN: CurrentUser = { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 3600 }

export interface RenderViewOptions {
  /** The URL the view opens at, e.g. "/apps?page=2". */
  path?: string
  /** Signed in as this user; none: a visitor. */
  user?: CurrentUser | null
  theme?: Theme
}

export async function renderView(ui: ReactNode, { path = '/', user = null, theme = 'dark' }: RenderViewOptions = {}) {
  const store = makeStore()
  store.dispatch(checkSession.fulfilled(user, 'test'))
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
