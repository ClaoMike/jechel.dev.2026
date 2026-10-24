import { APPS } from '../data.ts'
import { expect, test } from './fixtures.ts'

// The Apps page as visitors see it: the apps the setup added, newest first, and each one's popup.

const apps = (page: import('@playwright/test').Page) => page.getByRole('list', { name: 'Apps' }).getByRole('listitem')
const newestFirst = [...APPS].reverse()

test('shows the newest 9 apps, then the rest on page 2', async ({ page }) => {
  await page.goto('/apps')
  await expect(apps(page).getByRole('heading')).toHaveText(newestFirst.slice(0, 9))
  await page.getByRole('navigation', { name: 'Pagination' }).getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL('/apps?page=2')
  await expect(apps(page).getByRole('heading')).toHaveText(newestFirst.slice(9))
})

test("opens an app's details in a popup, and closes it with Escape, the keyboard back on its button", async ({ page }) => {
  await page.goto('/apps')
  const button = page.getByRole('button', { name: 'E2E app 5' })
  // From the keyboard (Safari doesn't focus a button that's clicked, so there'd be no focus to give back).
  await button.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'E2E app 5' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('E2E app 5 does one thing well.')).toBeVisible()
  await expect(dialog.getByRole('list', { name: 'Runs on' }).getByRole('listitem')).toHaveText(['Web', 'Android'])
  await expect(dialog.getByRole('link', { name: /Website/ })).toHaveAttribute('href', 'https://example.com/')
  // Visitors can't change it.
  await expect(dialog.getByRole('button', { name: 'Edit' })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
})

test('the popup closes with its Close button, and from the keyboard alone', async ({ page }) => {
  await page.goto('/apps')
  await page.getByRole('button', { name: 'E2E app 3' }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'E2E app 3' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
})

test('the page behind the popup does not scroll while it is open', async ({ page }) => {
  await page.goto('/apps')
  await page.getByRole('button', { name: 'E2E app 1' }).click()
  await expect(page.getByRole('dialog', { name: 'E2E app 1' })).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
})
