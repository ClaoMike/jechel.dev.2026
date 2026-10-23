import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// On a phone-sized screen (an iPhone's 390 × 844): nothing runs off the side, the tabs and popups work.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const path of ['/', '/apps', '/youtube', '/about', '/contact', '/terms']) {
  test(`${path} fits the screen: no sideways scrolling`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main')).not.toBeEmpty()
    expect(await sideways(page)).toBeLessThanOrEqual(0)
  })
}

test('every tab can be reached and used', async ({ page }) => {
  await page.goto('/')
  const contact = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Contact' })
  await contact.scrollIntoViewIfNeeded()
  await contact.tap()
  await expect(page).toHaveURL('/contact')
  await expect(page.getByRole('heading', { name: 'Contact me' })).toBeVisible()
})

test("an app's popup fits the screen, and only its inside scrolls", async ({ page }) => {
  await page.goto('/apps')
  await page.getByRole('button', { name: 'E2E app 2', exact: true }).tap()
  const dialog = page.getByRole('dialog', { name: 'E2E app 2' })
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
  expect(await dialog.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0)
  await dialog.getByRole('button', { name: 'Close' }).tap()
  await expect(dialog).toBeHidden()
})

test('the contact form can be filled in and sent', async ({ page }) => {
  await page.goto('/contact')
  await page.getByRole('textbox', { name: 'Name' }).fill('Phone visitor')
  await page.getByRole('textbox', { name: 'Email' }).fill('phone@e2e.test')
  await page.getByRole('textbox', { name: 'Message' }).fill('Written on a phone. '.repeat(6))
  await page.getByRole('button', { name: 'Send message' }).tap()
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible()
})
