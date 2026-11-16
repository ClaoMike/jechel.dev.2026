import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { SupportButton } from '@/features/support'
import { SubscribeButton } from '@/features/updates'
import { stubApi } from '@/test/api'
import { SITE } from '@/test/fixtures/site'
import { renderView } from '@/test/render'

// The header buttons' icons: the Get updates bell rings every 10 seconds, and on hover turns yellow and rings (the bell swings, its
// clapper follows); the coffee always steams, and on hover its cup fills. Tests run with reduced motion:
// what shows is checked on the page, how it moves in the stylesheet.

const bell = () => page.getByRole('button', { name: 'Get updates by email' })
const coffee = () => page.getByRole('link', { name: 'Buy me a coffee (opens in a new tab)' })
const part = (root: Element, selector: string) => root.querySelector<SVGElement>(selector)!

/** The style rules whose selector mentions every one of `parts`. */
function rules(...parts: string[]) {
  const all = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
  const flat = all.flatMap((rule) => (rule instanceof CSSMediaRule ? [...rule.cssRules].map((inner) => ({ rule: inner, media: rule.conditionText })) : [{ rule, media: '' }]))
  return flat.filter((r): r is { rule: CSSStyleRule; media: string } => r.rule instanceof CSSStyleRule && parts.every((p) => (r.rule as CSSStyleRule).selectorText.includes(p)))
}

const keyframes = (name: string) =>
  [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).find((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule && rule.name === name)

/** The angles a swing goes through, leaving out the frames where it's at rest. */
const rotations = (name: string) => [...keyframes(name)!.cssRules].map((frame) => (frame as CSSKeyframeRule).style.transform).filter((t) => !/^rotate\(0(deg)?\)$/.test(t))

describe('the Get updates bell', () => {
  it('is drawn in two parts, the bell and its clapper, that hang from the same point at the top', async () => {
    stubApi()
    await renderView(<SubscribeButton />)
    const svg = bell().element().querySelector('svg.bell-icon')!
    const [body, clapper] = [part(svg, '.bell-body'), part(svg, '.bell-clapper')]
    expect(body).not.toBeNull()
    expect(clapper).not.toBeNull()
    expect([getComputedStyle(body).transformOrigin, getComputedStyle(clapper).transformOrigin]).toEqual(['12px 2px', '12px 2px'])
    expect(getComputedStyle(body).transformBox).toBe('view-box')
    // A swing hangs from the hook: the pivot is above the bell's body, which starts at y = 2.
    const box = (body as SVGGraphicsElement).getBBox()
    expect(box.y).toBeGreaterThanOrEqual(2)
  })

  it('turns yellow on hover, and on keyboard focus, and goes back after', async () => {
    stubApi()
    await renderView(<SubscribeButton />)
    const body = part(bell().element(), '.bell-body')
    expect(getComputedStyle(body).fill).toBe('none')

    await bell().hover()
    await expect.poll(() => getComputedStyle(body).fill).toBe('rgb(255, 204, 0)')
    expect(getComputedStyle(bell().element().querySelector('svg')!).color).toBe('rgb(232, 168, 0)')

    await page.elementLocator(document.body).hover({ position: { x: 1, y: 1 } })
    await expect.poll(() => getComputedStyle(body).fill).toBe('none')
    await userEvent.tab()
    expect(document.activeElement).toBe(bell().element())
    await expect.poll(() => getComputedStyle(body).fill).toBe('rgb(255, 204, 0)')
  })

  it('rings on hover, over and over: the bell swings both ways, the clapper a beat later and wider', () => {
    const ring = rules('.subscribe-button', '.bell-body').find((r) => r.rule.style.animationName === 'bell-ring')!
    const follow = rules('.subscribe-button', '.bell-clapper').find((r) => r.rule.style.animationName === 'bell-clapper')!
    for (const { rule, media } of [ring, follow]) {
      expect(rule.selectorText).toContain(':hover')
      expect(rule.selectorText).toContain(':focus-visible')
      expect(rule.style.animationIterationCount).toBe('infinite')
      expect(media).toBe('')
    }
    const degrees = (name: string) => rotations(name).map((t) => parseFloat(t.match(/rotate\((-?[\d.]+)deg\)/)![1]))
    const bellSwing = degrees('bell-ring')
    const clapperSwing = degrees('bell-clapper')
    // Left and right, dying down.
    expect(bellSwing.some((d) => d > 0) && bellSwing.some((d) => d < 0)).toBe(true)
    expect(Math.abs(bellSwing[0])).toBeGreaterThan(Math.abs(bellSwing.at(-1)!))
    // The clapper swings further than the bell, and peaks later.
    expect(Math.max(...clapperSwing.map(Math.abs))).toBeGreaterThan(Math.max(...bellSwing.map(Math.abs)))
    const firstPeak = (name: string) => parseFloat((keyframes(name)!.cssRules[1] as CSSKeyframeRule).keyText)
    expect(firstPeak('bell-clapper')).toBeGreaterThan(firstPeak('bell-ring'))
  })

  it('rings at rest too, once every 10 seconds: the same swing, in its own colours and empty', () => {
    for (const [shape, name, hover] of [
      ['.bell-body', 'bell-ring-idle', 'bell-ring'],
      ['.bell-clapper', 'bell-clapper-idle', 'bell-clapper'],
    ]) {
      const idle = rules(shape).find((r) => r.rule.style.animationName === name)!
      expect(idle.rule.selectorText).toBe(shape)
      expect(idle.media).toBe('')
      expect(idle.rule.style.animationDuration).toBe('10s')
      expect(idle.rule.style.animationIterationCount).toBe('infinite')
      // The hover's swing, frame for frame, over its first 1.2s, then still for the rest.
      expect(rotations(name)).toEqual(rotations(hover))
      const frames = [...keyframes(name)!.cssRules] as CSSKeyframeRule[]
      const lastMove = Math.max(...frames.filter((f) => !/^rotate\(0(deg)?\)$/.test(f.style.transform)).map((f) => parseFloat(f.keyText)))
      expect(lastMove).toBeLessThan(12)
    }
    // No yellow at rest: that's the hover's.
    expect(
      rules('.bell-body')
        .filter((r) => r.rule.style.fill)
        .every((r) => r.rule.selectorText.includes(':hover')),
    ).toBe(true)
  })

  it("stays still for visitors who ask for less motion, and in the tests' browser, which does", async () => {
    stubApi()
    await renderView(<SubscribeButton />)
    await bell().hover()
    const body = part(bell().element(), '.bell-body')
    await expect.poll(() => getComputedStyle(body).fill).toBe('rgb(255, 204, 0)')
    expect(getComputedStyle(body).animationName).toBe('none')
    expect(getComputedStyle(part(bell().element(), '.bell-clapper')).animationName).toBe('none')
    expect(rules('.bell-body').some((r) => r.media.includes('prefers-reduced-motion') && r.rule.style.animationName === 'none')).toBe(true)
  })
})

describe('the Buy me a coffee cup', () => {
  const show = async () => {
    stubApi()
    await renderView(<SupportButton />, { site: structuredClone(SITE) })
    await expect.element(coffee()).toBeVisible()
  }
  const waves = () => part(coffee().element(), '.coffee-steam')
  const fill = () => part(coffee().element(), '.coffee-fill')
  const EMPTY = 'matrix(1, 0, 0, 0, 0, 0)'
  const FULL = 'matrix(1, 0, 0, 1, 0, 0)'

  it('steams always: three waves, at rest as on hover (no straight lines any more)', async () => {
    await show()
    expect(waves().querySelectorAll('path')).toHaveLength(3)
    expect(coffee().element().querySelector('.coffee-steam-still')).toBeNull()
    expect(getComputedStyle(waves()).display).not.toBe('none')
    await coffee().hover()
    expect(getComputedStyle(waves()).display).not.toBe('none')
    const wave = rules('.coffee-steam path').find((r) => r.rule.style.animationName === 'coffee-steam')!
    expect(wave.rule.selectorText).not.toContain(':hover')
  })

  it('fills the cup with coffee on hover and keyboard focus, and empties it after', async () => {
    await show()
    expect(getComputedStyle(fill()).transform).toBe(EMPTY)

    await coffee().hover()
    await expect.poll(() => getComputedStyle(fill()).transform).toBe(FULL)

    await page.elementLocator(document.body).hover({ position: { x: 1, y: 1 } })
    await expect.poll(() => getComputedStyle(fill()).transform).toBe(EMPTY)
    ;(coffee().element() as HTMLElement).focus()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}{Tab}')
    await expect.poll(() => getComputedStyle(fill()).transform).toBe(FULL)
  })

  it('pours it in bottom to top, only inside the cup', async () => {
    await show()
    // Grows from its bottom edge.
    expect(getComputedStyle(fill()).transformBox).toBe('fill-box')
    expect(getComputedStyle(fill()).transformOrigin).toMatch(/ 13px$/)
    const pour = rules('.support-button', '.coffee-fill').find((r) => r.rule.selectorText.includes(':hover'))!
    expect(pour.rule.selectorText).toContain(':focus-visible')
    expect(pour.rule.style.transitionProperty).toBe('transform')
    // Clipped to the cup's own shape, one clip per icon on the page.
    const clip = fill()
      .getAttribute('clip-path')!
      .match(/^url\(#(.+)\)$/)![1]
    const cup = coffee().element().querySelector(`[id="${clip}"] path`)!
    expect(cup.getAttribute('d')).toBe('M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z')
  })

  it('makes each wave a curve that bends both ways, over its own line', async () => {
    await show()
    const wavePaths = [...waves().querySelectorAll('path')].map((p) => p.getAttribute('d')!)
    expect(wavePaths.map((d) => d.match(/^M(\d+)/)![1])).toEqual(['6', '10', '14'])
    for (const d of wavePaths) expect(d).toMatch(/c.*s/)
  })

  it('moves them up and fades them, one after another, over and over', () => {
    const wave = rules('.coffee-steam path').find((r) => r.rule.style.animationName === 'coffee-steam')!
    expect(wave.rule.style.animationIterationCount).toBe('infinite')
    const delays = [2, 3].map((n) => rules(`.coffee-steam path:nth-child(${n})`)[0].rule.style.animationDelay)
    expect(delays).toEqual(['0.5s', '1s'])
    const frames = [...keyframes('coffee-steam')!.cssRules] as CSSKeyframeRule[]
    expect([frames[0].style.opacity, frames.at(-1)!.style.opacity]).toEqual(['0', '0'])
    // Rising: it ends higher up than it starts.
    const y = (frame: CSSKeyframeRule) => parseFloat(frame.style.transform.match(/translate\([^,]+,\s*(-?[\d.]+)px\)/)![1])
    expect(y(frames.at(-1)!)).toBeLessThan(y(frames[0]))
  })

  it("doesn't move for visitors who ask for less motion: the steam stays still, the cup is full at once", async () => {
    await show()
    expect(getComputedStyle(waves().querySelector('path')!).animationName).toBe('none')
    expect(rules('.coffee-steam path').some((r) => r.media.includes('prefers-reduced-motion') && r.rule.style.animationName === 'none')).toBe(true)
    expect(rules('.coffee-fill').some((r) => r.media.includes('prefers-reduced-motion') && r.rule.style.transitionProperty === 'none')).toBe(true)
  })
})
