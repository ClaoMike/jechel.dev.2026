import { expect, test } from '@playwright/test'

test.describe('a first visit', () => {
  // A fresh browser, which hasn't accepted the terms yet.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('asks to accept the terms; the terms open on top, and every box must be ticked', async ({ page }) => {
    await page.goto('/about')
    const welcome = page.getByRole('dialog', { name: 'Welcome to jechel.dev' })
    const continueButton = welcome.getByRole('button', { name: 'Continue' })
    await expect(continueButton).toBeDisabled()

    await page.keyboard.press('Escape')
    await expect(welcome).toBeVisible()

    await welcome.getByRole('button', { name: 'Terms and Conditions' }).click()
    const terms = page.getByRole('dialog', { name: 'Terms and Conditions' })
    await expect(terms.getByRole('heading', { level: 3 }).first()).toContainText('1.')
    await terms.getByRole('button', { name: 'Close' }).first().click()
    await expect(terms).toBeHidden()

    for (const box of await welcome.getByRole('checkbox').all()) await box.check()
    await continueButton.click()
    await expect(welcome).toBeHidden()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'jechel.dev' })).toBeVisible()
    await expect(welcome).toBeHidden()
  })
})

test('the footer opens the terms in a popup', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('contentinfo').getByRole('button', { name: 'Terms and Conditions' }).click()

  const terms = page.getByRole('dialog', { name: 'Terms and Conditions' })
  await expect(terms.getByRole('heading', { level: 3 }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(terms).toBeHidden()
})
