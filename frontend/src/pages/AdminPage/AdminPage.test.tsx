import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { api as realApi } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { ADMIN, forever, renderApp, shootWhole, textOf } from '../../test/render'

describe('the admin sign-in page', () => {
  it('offers Google sign-in, coming back to the home page', async () => {
    stubApi()
    await renderApp({ path: '/admin' })
    await expect.element(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
    await expect.element(page.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute('href', realApi.auth.googleLoginUrl('/'))
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  it('says why the last sign-in failed', async () => {
    stubApi()
    const cases: [string, string][] = [
      ['not_authorized', 'This Google account is not allowed to access the admin area.'],
      ['login_failed', 'Google sign-in was cancelled or failed. Please try again.'],
      ['weird', 'Something went wrong. Please try again.'],
    ]
    for (const [error, message] of cases) {
      const view = await renderApp({ path: `/admin?error=${error}` })
      await expect.poll(() => textOf(page.getByRole('alert'))).toBe(message)
      await view.unmount()
    }
  })

  it('shows the card’s shape while the session is checked, and sends the admin home once signed in', async () => {
    const api = stubApi()
    api.auth.me.mockReturnValue(forever())
    const checking = await renderApp({ path: '/admin' })
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading…')
    await checking.unmount()
    stubApi({ user: ADMIN })
    const signedIn = await renderApp({ path: '/admin' })
    await expect.element(page.getByText('Signed in as admin@example.com')).toBeVisible()
    expect(signedIn.location()).toBe('/')
  })

  for (const theme of THEMES) {
    it(`${theme}: looks right, with no WCAG problems`, async () => {
      stubApi()
      await renderApp({ theme, path: '/admin?error=not_authorized' })
      await expect.element(page.getByRole('alert')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-sign-in`)
    })
  }
})
