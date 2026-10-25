import type { Page } from '@playwright/test'
import { ADMIN_STATE } from './states.ts'
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

test('a swipe that starts on the current tab scrolls the bar, as on any other: nothing holds it back there', async ({ page }) => {
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Sections' })
  const current = tabs.locator('[aria-current="page"]')
  await expect(current).toHaveText("What's new?")
  // A touch-action other than auto (the bar's own scrolling) would stop a sideways swipe from it.
  for (const tab of [current, tabs.getByRole('link', { name: 'Apps' })]) expect(await tab.evaluate((el) => getComputedStyle(el).touchAction)).toBe('auto')
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

/**
 * A finger swiped sideways across the screen through the browser's own touch input (Chrome's DevTools protocol:
 * Chrome and Edge only; Playwright has no touch moves for Firefox or Safari).
 */
async function swipe(page: Page, { from, to, y = 500 }: { from: number; to: number; y?: number }) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] })
  for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + ((to - from) * step) / 6, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test.describe('swiping between pages (in Feature Testing: the admin only)', () => {
  test.use({ storageState: ADMIN_STATE })
  test.skip(({ browserName }) => browserName !== 'chromium', 'touch moves can only be sent in Chrome and Edge')

  test('a swipe left goes to the next tab, right to the previous; not from the edge, nor on the strip that scrolls', async ({ page }) => {
    await page.goto('/apps')
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'System' })).toBeVisible()
    await swipe(page, { from: 300, to: 100 })
    await expect(page).toHaveURL('/youtube')
    await swipe(page, { from: 100, to: 300 })
    await expect(page).toHaveURL('/apps')
    // From the screen's edge: the browser's.
    await swipe(page, { from: 386, to: 150 })
    await page.waitForTimeout(300)
    await expect(page).toHaveURL('/apps')

    await page.goto('/features/swipe')
    const strip = page.getByRole('region', { name: 'A strip that scrolls sideways' })
    await strip.scrollIntoViewIfNeeded()
    const box = (await strip.boundingBox())!
    await swipe(page, { from: 300, to: 100, y: box.y + box.height / 2 })
    await page.waitForTimeout(300)
    await expect(page).toHaveURL('/features/swipe')
    expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    // Elsewhere on the page, it goes.
    const heading = page.getByRole('heading', { name: 'Try it' })
    await heading.scrollIntoViewIfNeeded()
    await swipe(page, { from: 100, to: 300, y: (await heading.boundingBox())!.y + 8 })
    await expect(page).toHaveURL('/features/work-with-me')
  })
})

test("visitors' swipes don't change the page while it's in Feature Testing", async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch moves can only be sent in Chrome and Edge')
  await page.goto('/apps')
  await expect(page.locator('main')).not.toBeEmpty()
  await swipe(page, { from: 300, to: 100 })
  await page.waitForTimeout(300)
  await expect(page).toHaveURL('/apps')
})
