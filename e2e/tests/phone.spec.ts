import type { Page } from '@playwright/test'
import { expect, test, tap, typeInto } from './fixtures.ts'

// On a phone-sized screen (an iPhone's 390 × 844): nothing runs off the side, the tabs and popups work.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const path of ['/', '/apps', '/youtube', '/about', '/contact', '/terms']) {
  test(`${path} fits the screen: no sideways scrolling`, async ({ page, browserName }) => {
    await page.goto(path)
    await expect(page.locator('main')).not.toBeEmpty()
    expect(await sideways(page)).toBeLessThanOrEqual(0)
  })
}

test('every tab can be reached and used', async ({ page, browserName }) => {
  await page.goto('/')
  const contact = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Contact' })
  await contact.scrollIntoViewIfNeeded()
  await tap(contact, browserName)
  await expect(page).toHaveURL('/contact')
  await expect(page.getByRole('heading', { name: 'Contact me' })).toBeVisible()
})

test('the arrows scroll the tabs to either end and no further, however quickly they are pressed', async ({ page, browserName }) => {
  // The narrowest phones: the most tabs out of view.
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Sections' })
  const edges = async (name: string) => (await tabs.getByRole('link', { name, exact: true }).boundingBox())!
  const bar = async () => (await page.locator('.tabs-window').boundingBox())!
  // The end tabs sit against the bar's edges: only its own few pixels of padding between them.
  const padding = 4
  const gapAfterContact = async () => (await bar()).x + (await bar()).width - ((await edges('Contact')).x + (await edges('Contact')).width)
  const gapBeforeWhatsNew = async () => (await edges("What's new?")).x - (await bar()).x

  expect(await gapBeforeWhatsNew()).toBeLessThanOrEqual(padding + 1)
  const right = page.locator('.tabs-arrow-right')
  // An arrow goes once the bar stops at the end, maybe between seeing it and tapping it: then there's nothing to tap.
  for (let i = 0; i < 4 && (await right.isVisible()); i++) await tap(right, browserName, { timeout: 2000 }).catch(() => {})
  await expect(right).toBeHidden()
  await expect.poll(gapAfterContact, { timeout: 5000 }).toBeLessThanOrEqual(padding + 1)
  expect(await gapAfterContact()).toBeGreaterThanOrEqual(0)

  const left = page.locator('.tabs-arrow-left')
  for (let i = 0; i < 4 && (await left.isVisible()); i++) await tap(left, browserName, { timeout: 2000 }).catch(() => {})
  await expect(left).toBeHidden()
  await expect.poll(gapBeforeWhatsNew, { timeout: 5000 }).toBeLessThanOrEqual(padding + 1)
  expect(await gapBeforeWhatsNew()).toBeGreaterThanOrEqual(0)
})

test("an app's popup fits the screen, and only its inside scrolls", async ({ page, browserName }) => {
  await page.goto('/apps')
  await tap(page.getByRole('button', { name: 'E2E app 2', exact: true }), browserName)
  const dialog = page.getByRole('dialog', { name: 'E2E app 2' })
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
  expect(await dialog.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0)
  await tap(dialog.getByRole('button', { name: 'Close' }), browserName)
  await expect(dialog).toBeHidden()
})

test('the contact form can be filled in and sent', async ({ page, browserName }) => {
  await page.goto('/contact')
  await typeInto(page.getByRole('textbox', { name: 'Name' }), 'Phone visitor')
  await typeInto(page.getByRole('textbox', { name: 'Email' }), 'phone@e2e.test')
  await typeInto(page.getByRole('textbox', { name: 'Message' }), 'Written on a phone. '.repeat(6))
  await tap(page.getByRole('button', { name: 'Send message' }), browserName)
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible()
})
