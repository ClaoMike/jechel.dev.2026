import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { ApiError } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { TERMS } from '../../test/fixtures/site'
import { termsOpened } from '../../store/termsSlice'
import { ADMIN, forever, renderApp, shootWhole, textOf } from '../../test/render'

const gate = () => page.getByRole('dialog', { name: 'Welcome to jechel.dev' })
const termsDialog = () => page.getByRole('dialog', { name: 'Terms and Conditions' })
const consents = () => gate().getByRole('checkbox')
const continueButton = () => gate().getByRole('button', { name: 'Continue' })

describe('the welcome popup', () => {
  it('asks a visitor who never accepted the terms to tick the one box (accepting them), then continue', async () => {
    stubApi()
    await renderApp({ acceptedTerms: null })
    await expect.element(gate()).toBeVisible()
    expect(consents().elements()).toHaveLength(1)
    await expect.element(consents()).toHaveAccessibleName('I have read and I accept the Terms and Conditions of this website.')
    await expect.element(continueButton()).toBeDisabled()
    await expect.element(gate().getByText('Tick the box to continue.')).toBeVisible()
    await consents().click()
    await expect.element(gate().getByText('Tick the box to continue.')).not.toBeInTheDocument()
    await consents().click()
    await expect.element(continueButton()).toBeDisabled()
    await consents().click()
    await continueButton().click()
    await expect.element(gate()).not.toBeInTheDocument()
    expect(localStorage.getItem('terms.accepted')).toBe(TERMS.updatedAt)
  })

  it('asks nothing else: everything else is in the terms themselves', async () => {
    stubApi()
    await renderApp({ acceptedTerms: null })
    await expect.element(gate()).toBeVisible()
    await expect.poll(() => textOf(gate())).toContain('Before you continue, please read the Terms and Conditions and confirm that you accept them.')
    expect(textOf(gate())).not.toContain('contact form')
    expect(textOf(gate())).not.toContain('provided as it is')
  })

  it("can't be closed with Escape, and hides the footer while it's up", async () => {
    stubApi()
    await renderApp({ acceptedTerms: null })
    await expect.element(gate()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(gate()).toBeVisible()
    await expect.element(page.getByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('opens the terms above itself, and comes back when they close', async () => {
    stubApi()
    await renderApp({ acceptedTerms: null })
    await gate().getByRole('button', { name: 'Terms and Conditions' }).click()
    await expect.element(termsDialog()).toBeVisible()
    await termsDialog().getByRole('button', { name: 'Close' }).last().click()
    await expect.element(termsDialog()).not.toBeInTheDocument()
    await expect.element(gate()).toBeVisible()
  })

  it('asks again when the terms change, but not for the version already accepted', async () => {
    stubApi()
    const again = await renderApp({ acceptedTerms: '2025-01-01T00:00:00Z' })
    await expect.element(gate()).toBeVisible()
    await again.unmount()
    stubApi()
    await renderApp()
    await expect.element(page.getByRole('list', { name: 'Apps' }).or(page.getByRole('article'))).toBeVisible()
    await expect.element(gate()).not.toBeInTheDocument()
  })

  it('never asks the signed-in admin, nor anyone on the sign-in page', async () => {
    stubApi({ user: ADMIN })
    const admin = await renderApp({ acceptedTerms: null })
    await expect.element(page.getByText('Signed in as admin@example.com')).toBeVisible()
    await expect.element(gate()).not.toBeInTheDocument()
    await admin.unmount()
    stubApi()
    await renderApp({ acceptedTerms: null, path: '/admin' })
    await expect.element(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
    await expect.element(gate()).not.toBeInTheDocument()
  })

  it("asks only those who never accepted any version when the terms can't be loaded", async () => {
    const api = stubApi()
    api.terms.get.mockRejectedValue(new ApiError('/api/terms', 500))
    const never = await renderApp({ acceptedTerms: null })
    await expect.element(gate()).toBeVisible()
    // Asked once: the popup coming up doesn't ask again (it used to, in a loop).
    await new Promise((resolve) => setTimeout(resolve, 500))
    await expect.element(gate()).toBeVisible()
    expect(api.terms.get).toHaveBeenCalledTimes(1)
    await never.unmount()
    await renderApp({ acceptedTerms: 'some earlier version' })
    await expect.element(page.getByRole('navigation', { name: 'Sections' })).toBeVisible()
    await expect.element(gate()).not.toBeInTheDocument()
  })
})

describe('the terms popup', () => {
  it('opens from the footer: the title, when they changed, the introduction and numbered sections', async () => {
    stubApi()
    await renderApp()
    await page.getByRole('contentinfo').getByRole('button', { name: 'Terms and Conditions' }).click()
    await expect.element(termsDialog()).toBeVisible()
    await expect.element(termsDialog().getByText('Last updated 15 Sept 2026')).toBeVisible()
    await expect.element(termsDialog().getByRole('link', { name: 'jechel.dev' })).toHaveAttribute('href', 'https://jechel.dev')
    expect(termsDialog().getByRole('heading', { level: 3 }).elements().map((h) => h.textContent)).toEqual(['1. Who runs this site', '2. What you agree to'])
    await expect.poll(() => textOf(termsDialog().getByRole('list'))).toBe('Use it lawfully.Read the privacy notes.')
    await expect.element(termsDialog().getByRole('button', { name: 'Close' }).first()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(termsDialog()).not.toBeInTheDocument()
  })

  it('closes with × at the top only (no button at the bottom), Escape or a click outside', async () => {
    stubApi()
    await renderApp()
    const footerLink = page.getByRole('contentinfo').getByRole('button', { name: 'Terms and Conditions' })

    await footerLink.click()
    await expect.element(termsDialog()).toBeVisible()
    expect(termsDialog().getByRole('button').all().map((b) => b.element().getAttribute('aria-label') ?? b.element().textContent)).toEqual(['Close'])
    await termsDialog().getByRole('button', { name: 'Close' }).click()
    await expect.element(termsDialog()).not.toBeInTheDocument()

    await footerLink.click()
    await userEvent.keyboard('{Escape}')
    await expect.element(termsDialog()).not.toBeInTheDocument()

    await footerLink.click()
    await expect.element(termsDialog()).toBeVisible()
    const backdrop = document.querySelector<HTMLElement>('.modal-backdrop')!
    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await expect.element(termsDialog()).not.toBeInTheDocument()
  })

  it('goes to a page the terms link to (e.g. Contact) within the site, and makes way', async () => {
    const api = stubApi()
    api.terms.get.mockResolvedValue({ ...TERMS, intro: 'Questions? Write through the [Contact](/contact) page.' })
    const app = await renderApp()
    await page.getByRole('contentinfo').getByRole('button', { name: 'Terms and Conditions' }).click()

    await termsDialog().getByRole('link', { name: 'Contact' }).click()

    await expect.poll(() => app.location()).toBe('/contact')
    await expect.element(termsDialog()).not.toBeInTheDocument()
  })

  it('leaves out the date of terms never saved, and an empty introduction', async () => {
    const api = stubApi()
    api.terms.get.mockResolvedValue({ ...TERMS, intro: '', updatedAt: null })
    await renderApp({ acceptedTerms: 'default' })
    await page.getByRole('contentinfo').getByRole('button', { name: 'Terms and Conditions' }).click()
    await expect.element(termsDialog().getByRole('heading', { level: 3 }).first()).toBeVisible()
    expect(termsDialog().element().querySelector('.terms-updated')).toBeNull()
    expect(termsDialog().element().querySelector('.terms-intro')).toBeNull()
  })

  it("shows the terms' shape while they load, and says when they can't be loaded, with a retry", async () => {
    const api = stubApi()
    api.terms.get.mockReturnValue(forever())
    // No welcome popup while they load (it waits for them): open the terms as the footer would.
    const loading = await renderApp({ acceptedTerms: null })
    loading.store.dispatch(termsOpened())
    await expect.poll(() => textOf(termsDialog().getByRole('status'))).toBe('Loading the terms…')
    await loading.unmount()

    api.terms.get.mockRejectedValue(new ApiError('/api/terms', 500))
    await renderApp({ acceptedTerms: null })
    await gate().getByRole('button', { name: 'Terms and Conditions' }).click()
    await expect.poll(() => textOf(termsDialog().getByRole('alert'))).toContain("The terms couldn't be loaded.")
    api.terms.get.mockResolvedValue(structuredClone(TERMS))
    await termsDialog().getByRole('button', { name: 'Try again' }).click()
    await expect.element(termsDialog().getByText('Last updated 15 Sept 2026')).toBeVisible()
  })
})

describe('terms, screenshots and accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: the welcome popup and the terms`, async () => {
      stubApi()
      await renderApp({ theme, acceptedTerms: null })
      await expect.element(gate()).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(gate(), `${theme}-welcome`)
      await gate().getByRole('button', { name: 'Terms and Conditions' }).click()
      await expect.element(termsDialog().getByText('Last updated 15 Sept 2026')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(termsDialog(), `${theme}-terms`)
    })
  }
})
