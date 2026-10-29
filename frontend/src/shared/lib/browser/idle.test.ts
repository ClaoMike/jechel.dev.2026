import { afterEach, describe, expect, it } from 'vitest'
import { ACTIVITY, IDLE_MS, watchIdle } from './idle'

// After a while with nobody using the page, what moves on its own holds still (<html data-idle>).

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const idle = () => document.documentElement.hasAttribute('data-idle')
let stop: (() => void) | undefined

afterEach(() => stop?.())

describe('watchIdle', () => {
  it('waits a minute by default', () => {
    expect(IDLE_MS).toBe(60_000)
    expect(ACTIVITY).toEqual(['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'])
  })

  it('marks the page idle once nobody has used it for the time given', async () => {
    stop = watchIdle(document.documentElement, 60)
    expect(idle()).toBe(false)
    await wait(30)
    expect(idle()).toBe(false)
    await expect.poll(idle, { timeout: 500 }).toBe(true)
  })

  for (const type of ACTIVITY) {
    it(`wakes at a ${type}, and starts the wait over`, async () => {
      stop = watchIdle(document.documentElement, 60)
      await expect.poll(idle, { timeout: 500 }).toBe(true)
      window.dispatchEvent(new Event(type))
      expect(idle()).toBe(false)
      await wait(30)
      expect(idle()).toBe(false)
      await expect.poll(idle, { timeout: 500 }).toBe(true)
    })
  }

  it('counts scrolling inside a box, which never reaches the window by bubbling', async () => {
    const box = document.createElement('div')
    document.body.append(box)
    stop = watchIdle(document.documentElement, 60)
    await expect.poll(idle, { timeout: 500 }).toBe(true)
    box.dispatchEvent(new Event('scroll', { bubbles: false }))
    expect(idle()).toBe(false)
    box.remove()
  })

  it('wakes when the window gets focus back', async () => {
    stop = watchIdle(document.documentElement, 60)
    await expect.poll(idle, { timeout: 500 }).toBe(true)
    window.dispatchEvent(new FocusEvent('focus'))
    expect(idle()).toBe(false)
  })

  it('keeps moving while someone keeps using it', async () => {
    stop = watchIdle(document.documentElement, 80)
    for (let i = 0; i < 6; i++) {
      await wait(30)
      window.dispatchEvent(new Event('pointermove'))
    }
    expect(idle()).toBe(false)
  })

  it('stops watching: the mark goes and input no longer matters', async () => {
    const stopWatching = watchIdle(document.documentElement, 40)
    await expect.poll(idle, { timeout: 500 }).toBe(true)
    stopWatching()
    expect(idle()).toBe(false)
    await wait(80)
    expect(idle()).toBe(false)
  })

  it('pauses the neon colours, the eye blinking, the coffee’s steam and the bell while idle (the stylesheet; tests run with reduced motion, where they never move)', () => {
    const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    const paused = rules.filter((rule) => rule.selectorText.includes(':root[data-idle]') && rule.style.animationPlayState === 'paused')
    const selectors = paused.flatMap((rule) => rule.selectorText.split(',').map((s) => s.trim()))
    expect(selectors).toEqual(
      expect.arrayContaining([
        ':root[data-idle] .neon-text',
        ':root[data-idle] .neon-fill',
        ':root[data-idle] .content-toggle .eye-shape',
        ':root[data-idle] .coffee-steam path',
        ':root[data-idle] .bell-body',
        ':root[data-idle] .bell-clapper',
      ]),
    )
  })
})
