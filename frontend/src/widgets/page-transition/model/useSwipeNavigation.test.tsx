import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api } from '@/shared/api'
import { stubApi } from '@/test/api'
import { SITE } from '@/test/fixtures/site'
import { ADMIN, forever, renderApp } from '@/test/render'
import { SWIPE_DISTANCE, SWIPE_EDGE, SWIPE_MAX_MS } from './useSwipeNavigation'

// On a touchscreen, a swipe sideways on the page goes to the next or previous page, for everyone.

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

  it("goes from Contact to System's first page (Engagement) and back, through System's pages and each feature in turn, stopping at the end", async () => {
    const app = await asAdmin('/contact')
    toNext()
    await expect.poll(() => app.location()).toBe('/engagement')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/contact')
    toNext()
    await expect.poll(() => app.location()).toBe('/engagement')
    for (const path of ['/community', '/notifications', '/terms', '/settings', '/features/work-with-me']) {
      toNext()
      await expect.poll(() => app.location()).toBe(path)
    }
    toNext()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/features/work-with-me')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/settings')
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
    stubApi()
    const app = await renderApp({ path: '/contact' })
    const name = page.getByRole('textbox', { name: 'Name' })
    await expect.element(name).toBeVisible()
    toPrevious({ on: name.element() })
    toPrevious({ on: page.getByRole('textbox', { name: 'Message' }).element() })
    // Something wider than the page that scrolls sideways (a carousel, a wide table), on it.
    const strip = document.createElement('div')
    strip.style.cssText = 'overflow-x: auto; width: 200px'
    strip.innerHTML = '<p style="width: 600px">Wide</p>'
    document.querySelector('main section')!.append(strip)
    toPrevious({ on: strip.firstElementChild! })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/contact')
    // One that doesn't scroll is no reason.
    strip.style.overflowX = 'hidden'
    toPrevious({ on: strip.firstElementChild! })
    await expect.poll(() => app.location()).toBe('/about')
  })

  it('slides the page the way of the swipe; back later goes by the order', async () => {
    const real = window.matchMedia.bind(window)
    vi.spyOn(window, 'matchMedia').mockImplementation((q) => (q.includes('reduced-motion') ? ({ ...real(q), matches: false } as MediaQueryList) : real(q)))
    const app = await asAdmin('/contact')
    toNext()
    await expect.poll(() => app.location()).toBe('/engagement')
    await expect.poll(() => document.querySelector('.page-leave')?.className).toContain('page-to-left')
    toPrevious()
    await expect.poll(() => app.location()).toBe('/contact')
    await expect.poll(() => document.querySelector('.page-leave')?.className).toContain('page-to-right')
  })

  it("is everyone's: visitors go along the pages they can see, nothing after Contact", async () => {
    const api = stubApi()
    api.site.status.mockResolvedValue({ ...SITE, pages: { ...SITE.pages, youtube: false } })
    const app = await renderApp({ path: '/apps' })
    await expect.element(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Apps' })).toBeVisible()
    toNext()
    await expect.poll(() => app.location()).toBe('/about')
    toNext()
    await expect.poll(() => app.location()).toBe('/contact')
    toNext()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/contact')
  })

  it('is off while the page is hidden to show off Vice, and back with it', async () => {
    stubApi()
    const app = await renderApp({ path: '/apps', theme: 'vice' })
    await page.getByRole('button', { name: 'Hide page' }).click()
    toNext()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.location()).toBe('/apps')
    await page.getByRole('button', { name: 'Show page' }).click()
    toNext()
    await expect.poll(() => app.location()).toBe('/youtube')
  })
})
