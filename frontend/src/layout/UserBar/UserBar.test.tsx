import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../theme'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { TERMS } from '../../test/fixtures/site'
import { ADMIN, renderApp, renderView } from '../../test/render'
import { browser } from '../../utils/browser'
import { termsVersion } from '../../features/terms/acceptance'
import { UserBar } from './UserBar'

const bar = () => page.getByRole('region', { name: 'Development tools' })
const reset = () => bar().getByRole('button', { name: 'Reset terms acceptance' })
const gate = () => page.getByRole('dialog', { name: 'Welcome to jechel.dev' })

/** As `npm run dev` runs the site (tests run in Vite's "test" mode). */
const development = () => vi.stubEnv('MODE', 'development')

describe('the "User" bar (development only)', () => {
  it('is there for a visitor when running locally, saying "User"', async () => {
    development()
    await renderView(<UserBar />)
    await expect.element(bar()).toBeVisible()
    await expect.element(bar().getByText('User', { exact: true })).toBeVisible()
    await expect.element(reset()).toBeVisible()
  })

  it('is never on the live site, nor in tests unless switched on', async () => {
    vi.stubEnv('MODE', 'production')
    const live = await renderView(<UserBar />)
    expect(bar().query()).toBeNull()
    await live.unmount()

    vi.unstubAllEnvs()
    await renderView(<UserBar />)
    expect(bar().query()).toBeNull()
  })

  it('is not for the signed-in admin (theirs is the Admin bar)', async () => {
    development()
    await renderView(<UserBar />, { user: ADMIN })
    expect(bar().query()).toBeNull()
  })

  it('forgets that this browser accepted the terms, and reloads the page', async () => {
    development()
    localStorage.setItem('terms.accepted', termsVersion(TERMS))
    localStorage.setItem('theme', 'light')
    const reload = vi.spyOn(browser, 'reload').mockImplementation(() => {})
    await renderView(<UserBar />)

    await reset().click()

    expect(localStorage.getItem('terms.accepted')).toBeNull()
    // Only the acceptance: the visitor's other choices stay.
    expect(localStorage.getItem('theme')).toBe('light')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('brings the welcome popup back on the site, after the reload', async () => {
    development()
    stubApi()
    vi.spyOn(browser, 'reload').mockImplementation(() => {})
    const before = await renderApp()
    await expect.element(bar()).toBeVisible()
    expect(gate().query()).toBeNull()

    await reset().click()
    // What the reload does: the site starts again.
    await before.unmount()
    await renderApp({ acceptedTerms: null })

    await expect.element(gate()).toBeVisible()
  })

  it('sits in the header, above the site name', async () => {
    development()
    stubApi()
    await renderApp()
    await expect.element(bar()).toBeVisible()
    const header = page.getByRole('banner').element()
    expect(header.contains(bar().element())).toBe(true)
    expect(header.firstElementChild).toBe(bar().element())
  })

  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      development()
      await renderView(<UserBar />, { theme })
      await expect.element(bar()).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
