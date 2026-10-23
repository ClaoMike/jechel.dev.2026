import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { ApiError } from '../services/api'
import { slowSceneSwitched } from '../store/themeSlice'
import { stubApi } from '../test/api'
import { SITE, SUPPORT_URL } from '../test/fixtures/site'
import { ADMIN, forever, renderApp, textOf } from '../test/render'

const theme = () => page.getByRole('group', { name: 'Theme' })
const coffee = () => page.getByRole('link', { name: 'Buy me a coffee (opens in a new tab)' })
const tabs = () => page.getByRole('navigation', { name: 'Sections' })

// Tests run with animations off, so animations are checked in the site's rules: those that give an element one, and their frames.
const cssRules = () =>
  [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .flatMap((rule) => (rule instanceof CSSMediaRule ? [...rule.cssRules].map((inner) => ({ rule: inner, media: rule.conditionText })) : [{ rule, media: '' }]))
// (Not the tests' own rule that stops every animation.)
const animationRules = (el: Element, media = '') =>
  cssRules()
    .map(({ rule, media: m }) =>
      rule instanceof CSSStyleRule && m === media && rule.selectorText !== '*, ::before, ::after' && rule.style.animationName && el.matches(rule.selectorText) ? rule : null,
    )
    .filter((rule) => rule !== null)
const animations = (el: Element, media = '') => animationRules(el, media).map((rule) => rule.style.animationName)
const keyframes = (name: string) => cssRules().find(({ rule }) => rule instanceof CSSKeyframesRule && rule.name === name)!.rule as CSSKeyframesRule

describe('the header', () => {
  it('names the site, linking home', async () => {
    stubApi()
    const app = await renderApp({ path: '/apps' })
    await page.getByRole('link', { name: 'jechel.dev' }).click()
    await expect.poll(() => app.location()).toBe('/')
  })

  it('switches between dark, light and Vice, remembering the choice', async () => {
    stubApi()
    await renderApp({ theme: 'dark' })
    await expect.element(theme().getByRole('radio', { name: 'Dark mode' })).toBeChecked()
    await theme().getByTitle('Light mode').click()
    await expect.element(theme().getByRole('radio', { name: 'Light mode' })).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    await theme().getByTitle('Vice mode').click()
    expect(document.documentElement.dataset.theme).toBe('vice')
    await expect.poll(() => document.querySelector('.scene-background')).not.toBeNull()
  })

  it("turns the icon just picked, once: the sun's rays round it, the moon over the X axis, Vice over the Y axis", async () => {
    stubApi()
    await renderApp({ theme: 'dark' })
    await expect.element(theme().getByRole('radio', { name: 'Dark mode' })).toBeChecked()
    const option = (value: string) => theme().element().querySelector<HTMLElement>(`[data-theme-option="${value}"]`)!
    const turn = (name: string) => {
      const frames = keyframes(name)
      return (frames.cssRules[frames.cssRules.length - 1] as CSSKeyframeRule).style.transform
    }
    const [sun, rays, moon, vice] = [
      option('light').querySelector('svg')!,
      option('light').querySelector('.sun-rays')!,
      option('dark').querySelector('svg')!,
      option('vice').querySelector('.vice-mark')!,
    ]

    // Nothing turns on load.
    expect(theme().element().querySelector('[data-picked]')).toBeNull()
    expect(animations(moon)).toEqual([])

    await theme().getByTitle('Light mode').click()
    await expect.poll(() => option('light').hasAttribute('data-picked')).toBe(true)
    expect(animations(rays)).toEqual(['theme-sun-rays'])
    expect(turn('theme-sun-rays')).toBe('rotate(360deg)')
    // The sun itself stays still.
    expect(animations(sun)).toEqual([])

    await theme().getByTitle('Vice mode').click()
    await expect.poll(() => option('vice').hasAttribute('data-picked')).toBe(true)
    expect(option('light').hasAttribute('data-picked')).toBe(false)
    expect(animations(rays)).toEqual([])
    expect(animations(vice)).toEqual(['theme-flip-y'])
    expect(turn('theme-flip-y')).toContain('rotateY(360deg)')

    await theme().getByTitle('Dark mode').click()
    await expect.poll(() => option('dark').hasAttribute('data-picked')).toBe(true)
    expect(animations(moon)).toEqual(['theme-flip-x'])
    expect(turn('theme-flip-x')).toContain('rotateX(360deg)')
    expect(animations(vice)).toEqual([])

    // Reduced motion: none of it.
    for (const el of [rays, moon, vice]) expect(animations(el, '(prefers-reduced-motion: reduce)')).toEqual(['none'])
  })

  it('moves between themes with the arrow keys', async () => {
    stubApi()
    await renderApp({ theme: 'dark' })
    ;(theme().getByRole('radio', { name: 'Dark mode' }).element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(theme().getByRole('radio', { name: 'Light mode' })).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('links "Buy me a coffee" to the donation page, in a new tab', async () => {
    stubApi()
    await renderApp()
    await expect.element(coffee()).toHaveAttribute('href', SUPPORT_URL)
    await expect.element(coffee()).toHaveAttribute('target', '_blank')
    await expect.element(coffee()).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('holds the place of "Buy me a coffee" while it loads, and leaves it out with no page or no answer', async () => {
    const api = stubApi()
    api.support.get.mockReturnValue(forever())
    const loading = await renderApp()
    await expect.poll(() => document.querySelector('.header-button-skeleton')).not.toBeNull()
    await loading.unmount()
    api.support.get.mockResolvedValue({ url: '' })
    const none = await renderApp()
    await expect.element(tabs()).toBeVisible()
    await expect.element(coffee()).not.toBeInTheDocument()
    await none.unmount()
    api.support.get.mockRejectedValue(new ApiError('/api/support', 500))
    await renderApp()
    await expect.element(tabs()).toBeVisible()
    await expect.poll(() => document.querySelector('.header-button-skeleton')).toBeNull()
    await expect.element(coffee()).not.toBeInTheDocument()
  })

  it('marks the current tab', async () => {
    stubApi()
    await renderApp({ path: '/about' })
    await expect.element(tabs().getByRole('link', { name: 'About Me' })).toHaveAttribute('aria-current', 'page')
    await expect.element(tabs().getByRole('link', { name: 'Apps' })).not.toHaveAttribute('aria-current')
  })

  it("colours the admin's own tabs pink to violet, the same in every theme, current or not", async () => {
    const adminTabs = ['Engagement', 'Community', 'Notifications', 'Terms', 'Settings']
    for (const name of ['dark', 'light', 'vice'] as const) {
      stubApi({ user: ADMIN })
      const app = await renderApp({ path: '/engagement', theme: name })
      await expect.element(tabs().getByRole('link', { name: 'Settings' })).toBeVisible()
      const links = tabs().getByRole('link').elements()
      const own = links.filter((link) => adminTabs.includes(link.textContent!.trim()))
      expect(own.map((link) => link.textContent!.trim())).toEqual(adminTabs)
      for (const link of own) {
        const style = getComputedStyle(link)
        expect(link.classList.contains('tab-admin')).toBe(true)
        expect(style.backgroundImage).toBe('linear-gradient(90deg, rgb(217, 18, 137), rgb(153, 66, 240))')
        expect(style.color).toBe('rgba(0, 0, 0, 0)')
        expect(style.backgroundClip).toBe('text')
      }
      // The visitors' pages keep the theme's colours.
      for (const link of links.filter((link) => !own.includes(link))) expect(getComputedStyle(link).backgroundImage).toBe('none')
      await app.unmount()
    }
  })

  it("has no pink tabs for visitors (they don't see the admin's)", async () => {
    stubApi()
    await renderApp()
    await expect.element(tabs().getByRole('link', { name: 'Apps' })).toBeVisible()
    expect(document.querySelector('.tab-admin')).toBeNull()
  })
})

describe('the admin bar', () => {
  it('shows who is signed in, and is only there for the admin', async () => {
    stubApi({ user: ADMIN })
    const admin = await renderApp()
    await expect.element(page.getByText('Signed in as admin@example.com')).toBeVisible()
    await expect.element(page.getByText('Admin', { exact: true })).toBeVisible()
    // The preview switch is there in development (where tests run).
    await expect.element(page.getByRole('group', { name: 'Preview the site as' })).toBeVisible()
    await admin.unmount()
    stubApi()
    await renderApp()
    await expect.element(tabs()).toBeVisible()
    await expect.element(page.getByText(/Signed in as/)).not.toBeInTheDocument()
  })

  it('warns while maintenance is on, linking to Settings', async () => {
    const api = stubApi({ user: ADMIN })
    api.site.status.mockResolvedValue({ ...SITE, maintenance: true })
    const app = await renderApp()
    await page.getByRole('link', { name: 'Maintenance on: visitors see the maintenance page' }).click()
    await expect.poll(() => app.location()).toBe('/settings')
  })

  it('signs out: the site goes back to what visitors see', async () => {
    const api = stubApi({ user: ADMIN })
    await renderApp({ path: '/apps' })
    await page.getByRole('button', { name: 'Sign out' }).click()
    expect(api.auth.logout).toHaveBeenCalledOnce()
    await expect.element(page.getByText(/Signed in as/)).not.toBeInTheDocument()
    await expect.element(tabs().getByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Add an app' })).not.toBeInTheDocument()
  })
})

describe('Vice: hiding the page to see the scene', () => {
  it('hides the page and the header (they can no longer be used), and brings them back with the button or Escape', async () => {
    stubApi()
    await renderApp({ theme: 'vice' })
    await page.getByRole('button', { name: 'Hide page' }).click()
    expect(document.querySelector('main.page')?.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('header.site-header')?.hasAttribute('inert')).toBe(true)
    await page.getByRole('button', { name: 'Show page' }).click()
    expect(document.querySelector('main.page')?.hasAttribute('inert')).toBe(false)
    await page.getByRole('button', { name: 'Hide page' }).click()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('button', { name: 'Hide page' })).toBeVisible()
  })

  it('blinks the eye every 15 seconds, the page shown or hidden; the slash over it stays still', async () => {
    stubApi()
    await renderApp({ theme: 'vice' })
    for (const [name, next] of [
      ['Hide page', 'Show page'],
      ['Show page', 'Hide page'],
    ]) {
      const button = page.getByRole('button', { name })
      await expect.element(button).toBeVisible()
      const shape = [...button.element().querySelectorAll('.eye-shape')]
      expect(shape.length).toBeGreaterThan(0)
      for (const part of shape) {
        const [rule] = animationRules(part)
        expect(rule.style.animationName).toBe('eye-blink')
        expect([rule.style.animationDuration, rule.style.animationDelay, rule.style.animationIterationCount]).toEqual(['15s', '15s', 'infinite'])
        expect(animations(part, '(prefers-reduced-motion: reduce)')).toEqual(['none'])
      }
      for (const slash of button.element().querySelectorAll('.eye-slash')) expect(animations(slash)).toEqual([])
      await button.click()
      await expect.element(page.getByRole('button', { name: next })).toBeVisible()
    }
    // A blink: shut onto the middle line, then open again.
    const frames = [...keyframes('eye-blink').cssRules] as CSSKeyframeRule[]
    expect(frames.map((f) => f.style.transform)).toContain('scaleY(0.1)')
    expect(frames.find((f) => f.keyText.includes('100%'))!.style.transform).toBe('scaleY(1)')
  })

  it("on phones, sits in the header's row while the page shows (moving with it), and in the corner while it's hidden", async () => {
    await page.viewport(390, 844)
    try {
      stubApi()
      await renderApp({ theme: 'vice' })
      const header = document.querySelector('header.site-header')!
      const hide = page.getByRole('button', { name: 'Hide page' })
      await expect.element(hide).toBeVisible()
      expect(header.contains(hide.element())).toBe(true)
      expect(getComputedStyle(hide.element()).position).toBe('static')

      await hide.click()
      const show = page.getByRole('button', { name: 'Show page' })
      expect(header.contains(show.element())).toBe(false)
      expect(getComputedStyle(show.element()).position).toBe('fixed')
      // The button moved: it keeps the focus.
      expect(document.activeElement).toBe(show.element())

      await show.click()
      await expect.poll(() => header.contains(document.activeElement)).toBe(true)
    } finally {
      await page.viewport(1280, 900)
    }
  })

  it("keeps the scene in view when the browser gives <html> a background of its own (Firefox on iPhone)", async () => {
    stubApi()
    await renderApp({ theme: 'vice' })
    const injected = document.createElement('style')
    injected.textContent = 'html { background-color: #222 }'
    document.head.append(injected)
    try {
      // Body's black would then stay on body, over the scene (z-index: -1): in Vice, body has none.
      expect(getComputedStyle(document.body).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    } finally {
      injected.remove()
    }
    expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgb(0, 0, 0)')
  })

  it('is only there in Vice; leaving Vice always brings the page back', async () => {
    stubApi()
    await renderApp({ theme: 'dark' })
    await expect.element(tabs()).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Hide page' })).not.toBeInTheDocument()
    await page.getByRole('group', { name: 'Theme' }).getByTitle('Vice mode').click()
    await page.getByRole('button', { name: 'Hide page' }).click()
    ;(document.querySelector('input[value="dark"]') as HTMLInputElement).click()
    await expect.poll(() => document.querySelector('main.page')?.hasAttribute('inert')).toBe(false)
  })
})

describe('when Vice is too slow', () => {
  it('says why the theme changed, and offers to keep Vice', async () => {
    stubApi()
    const app = await renderApp({ theme: 'vice' })
    app.store.dispatch(slowSceneSwitched('dark'))
    await expect.poll(() => textOf(page.getByText(/Vice was running slowly/))).toBe('Vice was running slowly on this device, so the site switched to dark mode.')
    expect(document.documentElement.dataset.theme).toBe('dark')
    await page.getByRole('button', { name: 'Use Vice anyway' }).click()
    expect(document.documentElement.dataset.theme).toBe('vice')
    expect(localStorage.getItem('theme')).toBe('vice')
    await expect.element(page.getByText(/Vice was running slowly/)).not.toBeInTheDocument()
  })

  it('goes with OK, keeping the new theme', async () => {
    stubApi()
    const app = await renderApp({ theme: 'vice' })
    app.store.dispatch(slowSceneSwitched('light'))
    await expect.element(page.getByText(/switched to light mode/)).toBeVisible()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect.element(page.getByText(/switched to light mode/)).not.toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('the footer', () => {
  it('has the copyright and opens the terms', async () => {
    stubApi()
    await renderApp()
    await expect.poll(() => textOf(page.getByRole('contentinfo'))).toBe(`© ${new Date().getFullYear()} jechel.dev·Terms and Conditions`)
    await page.getByRole('contentinfo').getByRole('button', { name: 'Terms and Conditions' }).click()
    await expect.element(page.getByRole('dialog', { name: 'Terms and Conditions' })).toBeVisible()
  })
})
