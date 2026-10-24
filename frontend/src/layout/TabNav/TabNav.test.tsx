import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { stubApi } from '../../test/api'
import { ADMIN, renderApp } from '../../test/render'

// The tab bar: the highlight under the current tab can be dragged across; letting go opens the tab it's over.

const nav = () => page.getByRole('navigation', { name: 'Sections' })
const tab = (name: string) => nav().getByRole('link', { name, exact: true }).element() as HTMLAnchorElement
const indicator = () => nav().element().querySelector<HTMLElement>('.tab-indicator')!

/** A pointer event at the middle of `target`, moved by `dx`, as a mouse (pointer 1) or a finger sends it. */
function pointer(type: string, target: Element, dx = 0, { pointerId = 1, pointerType = 'mouse' } = {}) {
  const box = target.getBoundingClientRect()
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType,
      isPrimary: pointerId === 1,
      button: 0,
      clientX: box.left + box.width / 2 + dx,
      clientY: box.top + box.height / 2,
    }),
  )
}

/** From the current tab's middle to `to`'s middle, without letting go; the highlight is there once it resolves. */
async function dragTo(from: HTMLElement, to: HTMLElement, options?: { pointerId?: number; pointerType?: string }) {
  const distance = to.getBoundingClientRect().left + to.offsetWidth / 2 - (from.getBoundingClientRect().left + from.offsetWidth / 2)
  pointer('pointerdown', from, 0, options)
  pointer('pointermove', from, distance / 2, options)
  pointer('pointermove', from, distance, options)
  await expect.poll(() => indicator().style.width).toBe(`${to.offsetWidth}px`)
}

async function open(path = '/') {
  stubApi({ user: ADMIN })
  const app = await renderApp({ path })
  await expect.poll(() => indicator()).not.toBeNull()
  return app
}

afterEach(() => {
  document.body.style.width = ''
})

describe('dragging the highlight', () => {
  it('follows the pointer, and letting go over a tab opens it', async () => {
    const app = await open('/')
    const from = tab("What's new?")
    const to = tab('About Me')

    await dragTo(from, to)
    await expect.poll(() => nav().element().hasAttribute('data-dragging')).toBe(true)
    await expect.poll(() => indicator().style.width).toBe(`${to.offsetWidth}px`)
    pointer('pointerup', from, to.getBoundingClientRect().left - from.getBoundingClientRect().left)

    await expect.poll(() => app.location()).toBe('/about')
    expect(nav().element().hasAttribute('data-dragging')).toBe(false)
  })

  it('a mouse drag ends with a click on whatever is under it: that click opens nothing', async () => {
    const app = await open('/')
    const from = tab("What's new?")
    const to = tab('About Me')

    await dragTo(from, to)
    pointer('pointerup', from, to.getBoundingClientRect().left - from.getBoundingClientRect().left)
    tab('Apps').click()

    await expect.poll(() => app.location()).toBe('/about')
  })

  it('after a finger drag (no click follows), the next tap opens its tab', async () => {
    const app = await open('/')
    const from = tab("What's new?")
    const to = tab('About Me')

    await dragTo(from, to, { pointerType: 'touch' })
    pointer('pointerup', from, to.getBoundingClientRect().left - from.getBoundingClientRect().left, { pointerType: 'touch' })
    await expect.poll(() => app.location()).toBe('/about')
    await new Promise((resolve) => setTimeout(resolve, 10))

    tab('Apps').click()
    await expect.poll(() => app.location()).toBe('/apps')
  })

  it('a tap is a tap: moving less than 5 pixels opens nothing new', async () => {
    const app = await open('/')
    const from = tab("What's new?")

    pointer('pointerdown', from)
    pointer('pointermove', from, 3)
    pointer('pointerup', from, 3)

    expect(nav().element().hasAttribute('data-dragging')).toBe(false)
    expect(app.location()).toBe('/')
  })

  it('only the current tab is a handle', async () => {
    const app = await open('/')

    pointer('pointerdown', tab('Apps'))
    pointer('pointermove', tab('Apps'), 200)
    pointer('pointerup', tab('Apps'), 200)

    expect(nav().element().hasAttribute('data-dragging')).toBe(false)
    expect(app.location()).toBe('/')
  })

  it('another finger lifting doesn’t end the drag', async () => {
    const app = await open('/')
    const from = tab("What's new?")
    const to = tab('About Me')

    await dragTo(from, tab('Apps'))
    pointer('pointerup', from, 0, { pointerId: 7, pointerType: 'touch' })
    pointer('pointermove', from, to.getBoundingClientRect().left + to.offsetWidth / 2 - (from.getBoundingClientRect().left + from.offsetWidth / 2))
    await expect.poll(() => indicator().style.width).toBe(`${to.offsetWidth}px`)
    pointer('pointerup', from, to.getBoundingClientRect().left - from.getBoundingClientRect().left)

    await expect.poll(() => app.location()).toBe('/about')
  })

  it('a cancelled drag puts the highlight back', async () => {
    const app = await open('/')
    const from = tab("What's new?")
    const home = indicator().style.transform

    await dragTo(from, tab('About Me'))
    pointer('pointercancel', from)

    await expect.poll(() => nav().element().hasAttribute('data-dragging')).toBe(false)
    await expect.poll(() => indicator().style.transform).toBe(home)
    expect(app.location()).toBe('/')
  })

  it('letting go back over the current tab stays there', async () => {
    const app = await open('/apps')
    const from = tab('Apps')

    pointer('pointerdown', from)
    pointer('pointermove', from, 20)
    pointer('pointermove', from, 0)
    pointer('pointerup', from, 0)

    expect(app.location()).toBe('/apps')
  })
})

describe('more tabs than fit', () => {
  it('shows an arrow on the side with more, which scrolls the bar that way', async () => {
    await page.viewport(420, 800)
    try {
      await open('/')
      const bar = nav().element() as HTMLElement
      await expect.poll(() => document.querySelector('.tabs-arrow-right')).not.toBeNull()
      expect(document.querySelector('.tabs-arrow-left')).toBeNull()

      ;(document.querySelector('.tabs-arrow-right') as HTMLButtonElement).click()
      await expect.poll(() => bar.scrollLeft).toBeGreaterThan(0)
      await expect.poll(() => document.querySelector('.tabs-arrow-left')).not.toBeNull()

      ;(document.querySelector('.tabs-arrow-left') as HTMLButtonElement).click()
      await expect.poll(() => bar.scrollLeft).toBe(0)
    } finally {
      await page.viewport(1280, 900)
    }
  })
})

describe('more tabs than fit, on a phone', () => {
  const frame = () => document.querySelector<HTMLElement>('.tabs-frame')!
  const windowBox = () => document.querySelector<HTMLElement>('.tabs-window')!.getBoundingClientRect()
  const mask = (element: Element) => {
    const style = getComputedStyle(element)
    return style.maskImage || style.webkitMaskImage
  }
  const arrow = (side: 'left' | 'right') => document.querySelector<HTMLButtonElement>(`.tabs-arrow-${side}`)
  const tabBoxes = (bar: HTMLElement) => [...bar.querySelectorAll('.tab')].map((t) => t.getBoundingClientRect())
  /** The bar's own padding: the end tabs sit this far in from its edges, no further. */
  const PADDING = 4

  async function openVisitor(width = 375) {
    await page.viewport(width, 800)
    stubApi()
    await renderApp({ path: '/' })
    await expect.poll(() => arrow('right')).not.toBeNull()
    return nav().element() as HTMLElement
  }

  afterEach(async () => {
    await page.viewport(1280, 900)
  })

  it('starts with the first tab against the left edge, and fades only the right end, where the arrow is', async () => {
    const bar = await openVisitor()
    expect(tabBoxes(bar)[0].left - windowBox().left).toBeLessThanOrEqual(PADDING + 1)
    expect(frame().hasAttribute('data-more-left')).toBe(false)
    expect(mask(document.querySelector('.tabs-window')!)).toContain('linear-gradient')
    // Never on the bar that scrolls (Safari on iPhone drew the tabs in the wrong place when it changed there mid-scroll).
    expect(mask(bar)).toBe('none')
  })

  it('the right arrow stops with the last tab against the right edge, however often it is pressed', async () => {
    const bar = await openVisitor(320)
    for (let i = 0; i < 5; i++) arrow('right')?.click()
    await expect.poll(() => arrow('right')).toBeNull()
    await expect.poll(() => bar.scrollLeft).toBe(bar.scrollWidth - bar.clientWidth)
    expect(windowBox().right - tabBoxes(bar).at(-1)!.right).toBeLessThanOrEqual(PADDING + 1)
    expect(mask(bar)).toBe('none')
  })

  it("the fades and arrows change once the bar stops, not while it's moving", async () => {
    const bar = await openVisitor(320)
    arrow('right')!.click()
    await expect.poll(() => bar.scrollLeft).toBeGreaterThan(0)
    // Moving (or only just stopped): still as it was.
    expect(frame().hasAttribute('data-more-left')).toBe(false)
    await expect.poll(() => frame().hasAttribute('data-more-left')).toBe(true)
  })

  it('quick presses add up: two take the bar twice as far as one, and back again to the very start', async () => {
    const bar = await openVisitor(320)
    const step = Math.round(bar.clientWidth * 0.7)
    arrow('right')!.click()
    arrow('right')!.click()
    await expect.poll(() => Math.round(bar.scrollLeft)).toBe(Math.min(2 * step, bar.scrollWidth - bar.clientWidth))
    await expect.poll(() => arrow('left')).not.toBeNull()
    for (let i = 0; i < 4; i++) arrow('left')?.click()
    await expect.poll(() => bar.scrollLeft).toBe(0)
    await expect.poll(() => arrow('left')).toBeNull()
    expect(tabBoxes(bar)[0].left - windowBox().left).toBeLessThanOrEqual(PADDING + 1)
  })

  it("opening an admin tab's page (e.g. a reload) shows its tab, clear of the arrows, though the admin's tabs come only once the session is known", async () => {
    for (const path of ['/terms', '/features']) {
      await page.viewport(375, 800)
      stubApi({ user: ADMIN })
      const app = await renderApp({ path })
      const current = () => nav().element().querySelector<HTMLElement>('[aria-current="page"]')
      await expect.poll(() => current()?.getAttribute('href')).toBe(path)
      const bar = windowBox()
      await expect.poll(() => current()!.getBoundingClientRect().left).toBeGreaterThanOrEqual(bar.left)
      await expect.poll(() => current()!.getBoundingClientRect().right).toBeLessThanOrEqual(bar.right)
      // Not under an arrow.
      for (const side of ['left', 'right'] as const) {
        const box = arrow(side)?.getBoundingClientRect()
        if (box) expect(box.right <= current()!.getBoundingClientRect().left || box.left >= current()!.getBoundingClientRect().right).toBe(true)
      }
      await app.unmount()
    }
  })

  it("a press that changes nothing (the bar already gliding to the end) doesn't start the glide over: Safari stopped it short", async () => {
    const bar = await openVisitor(375)
    const scrollTo = vi.spyOn(bar, 'scrollTo')
    // One press reaches the end here; the arrow stays until the bar has stopped.
    arrow('right')!.click()
    arrow('right')!.click()
    arrow('right')!.click()
    expect(scrollTo).toHaveBeenCalledTimes(1)
    await expect.poll(() => arrow('right')).toBeNull()
    expect(bar.scrollLeft).toBe(bar.scrollWidth - bar.clientWidth)
  })

  it('on a wide screen nothing fades and there are no arrows', async () => {
    stubApi()
    await renderApp({ path: '/' })
    await expect.element(page.getByRole('link', { name: 'Contact', exact: true })).toBeVisible()
    expect(mask(document.querySelector('.tabs-window')!)).toBe('none')
    expect(arrow('right')).toBeNull()
  })
})
