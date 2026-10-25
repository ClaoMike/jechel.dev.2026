import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api } from '../services/api'
import { stubApi } from '../test/api'
import { ADMIN, forever, renderApp } from '../test/render'
import { SWIPE_DISTANCE, SWIPE_EDGE, SWIPE_MAX_MS } from './useSwipeNavigation'

// On a touchscreen, a swipe sideways on the page goes to the next or previous page (in Feature Testing: the admin's only).

interface Swipe {
  /** Where the finger goes down, from the window's left; it goes `dx` sideways and `dy` down. */
  x?: number
  y?: number
  dx: number
  dy?: number
  /** How long the finger is down, in ms. */
  ms?: number
  on?: Element
  fingers?: number
}

let touchId = 0

/** A finger (or more) down on `on`, moved and lifted, as the browser reports it. */
function swipe({ x = window.innerWidth / 2, y = 300, dx, dy = 0, ms = 150, on = document.querySelector('main')!, fingers = 1 }: Swipe) {
  const touches = Array.from({ length: fingers }, (_, i) => new Touch({ identifier: ++touchId, target: on, clientX: x + i * 30, clientY: y }))
  const start = new TouchEvent('touchstart', { touches, targetTouches: touches, changedTouches: touches, bubbles: true, cancelable: true })
  // The event's time is when it was made: a slow swipe is faked by moving the start back.
  vi.spyOn(start, 'timeStamp', 'get').mockReturnValue(performance.now() - ms)
  on.dispatchEvent(start)
  const lifted = touches.map((t) => new Touch({ identifier: t.identifier, target: on, clientX: t.clientX + dx, clientY: y + dy }))
  on.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: lifted, bubbles: true, cancelable: true }))
}

/** Swipes left: the next page. */
const toNext = (more: Omit<Swipe, 'dx'> = {}) => swipe({ dx: -120, ...more })
/** Swipes right: the previous page. */
const toPrevious = (more: Omit<Swipe, 'dx'> = {}) => swipe({ dx: 120, ...more })

/** The admin's pages load what they show: here, whatever stubApi doesn't answer stays loading. */
function holdTheRest() {
  for (const group of Object.values(api) as Record<string, () => Promise<unknown>>[])
    for (const [name, method] of Object.entries(group)) if (typeof method === 'function' && !vi.isMockFunction(method)) vi.spyOn(group, name).mockImplementation(forever)
}

async function asAdmin(path: string) {
  stubApi({ user: ADMIN })
  holdTheRest()
  const app = await renderApp({ path })
  await expect.element(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'System' })).toBeVisible()
  return app
}

describe('swiping between pages', () => {
  it('goes to the next tab with a swipe to the left, and back with one to the right', async () => {
    const app = await asAdmin('/apps')
    toNext()
    await expect.poll(() => app.location()).toBe('/youtube')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/apps')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/')
    // Nothing before the first.
    toPrevious()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/')
  })

  it("goes from Contact into System, then between System's pages and each feature in turn, stopping at the end", async () => {
    const app = await asAdmin('/contact')
    toNext()
    await expect.poll(() => app.location()).toBe('/engagement')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/engagement')
    for (const path of ['/community', '/notifications', '/terms', '/settings', '/features/work-with-me', '/features/swipe']) {
      toNext()
      await expect.poll(() => app.location()).toBe(path)
    }
    await expect.element(page.getByRole('region', { name: 'Swipe between pages' })).toBeVisible()
    toNext()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/features/swipe')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/features/work-with-me')
  })

  it('takes no short, slow or mostly-up-and-down swipe, nor two fingers, nor one from the screen’s edge', async () => {
    const app = await asAdmin('/apps')
    swipe({ dx: -(SWIPE_DISTANCE - 5) })
    swipe({ dx: -120, ms: SWIPE_MAX_MS + 200 })
    swipe({ dx: -120, dy: 80 })
    toNext({ fingers: 2 })
    toNext({ x: SWIPE_EDGE - 4 })
    toNext({ x: window.innerWidth - SWIPE_EDGE + 4 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/apps')
    // A clear one still goes.
    swipe({ dx: -SWIPE_DISTANCE, dy: 20 })
    await expect.poll(() => app.location()).toBe('/youtube')
  })

  it('leaves a swipe in a text box, or on something that scrolls sideways, to it', async () => {
    const app = await asAdmin('/features/swipe')
    const region = page.getByRole('region', { name: 'Swipe between pages' })
    await expect.element(region).toBeVisible()
    toPrevious({ on: region.getByRole('textbox', { name: 'A text box' }).element() })
    const strip = region.getByRole('region', { name: 'A strip that scrolls sideways' }).element()
    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)
    toPrevious({ on: strip.firstElementChild! })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/features/swipe')
    // Elsewhere on the same page, it goes.
    toPrevious({ on: region.getByRole('heading', { name: 'Try it' }).element() })
    await expect.poll(() => app.location()).toBe('/features/work-with-me')
  })

  it("slides the page the way of the swipe, even between Feature Testing's features; back later goes by the order", async () => {
    const real = window.matchMedia.bind(window)
    vi.spyOn(window, 'matchMedia').mockImplementation((q) => (q.includes('reduced-motion') ? ({ ...real(q), matches: false } as MediaQueryList) : real(q)))
    const app = await asAdmin('/features/work-with-me')
    toNext()
    await expect.poll(() => app.location()).toBe('/features/swipe')
    await expect.poll(() => document.querySelector('.page-leave')?.className).toContain('page-to-left')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/features/work-with-me')
    await expect.poll(() => document.querySelector('.page-leave')?.className).toContain('page-to-right')
  })

  it("is the admin's only while it's in Feature Testing: visitors' swipes do nothing", async () => {
    stubApi()
    const app = await renderApp({ path: '/apps' })
    await expect.element(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Apps' })).toBeVisible()
    toNext()
    toPrevious()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/apps')
  })
})
