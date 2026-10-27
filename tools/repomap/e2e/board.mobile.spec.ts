import { expect, test, type Page } from '@playwright/test'
import { hasNoHorizontalOverflow, watchErrors } from './helpers.ts'

/** The phone hides the repository name: wait for the board itself. */
const mapLoaded = (page: Page) => expect(page.getByTestId('board-svg')).toBeVisible({ timeout: 20_000 })
const chip = (page: Page, id: string) => page.locator(`[data-chip="${id}"]`)

async function center(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = (await chip(page, id).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Two fingers spreading apart around a point (CDP touch events: Chromium only). */
async function pinchOut(page: Page, at: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [
        { x: at.x - d, y: at.y, id: 1 },
        { x: at.x + d, y: at.y, id: 2 },
      ],
    })
  await touch('touchStart', 10)
  for (let d = 14; d <= 150; d += 8) await touch('touchMove', d)
  await touch('touchEnd', 150)
}

test.describe('board on a phone', () => {
  test('tap selects (the sheet describes it), double-tap opens, the trail goes back', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/#tab=board&board=tiers')
    await mapLoaded(page)
    await expect(chip(page, 'frontend')).toBeVisible()
    const at = await center(page, 'frontend')
    await page.touchscreen.tap(at.x, at.y)
    await expect(page.getByTestId('board-chip-details')).toContainText('Frontend')
    await expect(page.getByTestId('board-open')).toBeInViewport()
    await page.touchscreen.tap(at.x, at.y)
    await expect(chip(page, 'f:book')).toBeVisible()
    await page.getByTestId('board-trail-1').tap()
    await expect(chip(page, 'frontend')).toBeVisible()
    expect(await hasNoHorizontalOverflow(page)).toBe(true)
    expect(errors).toEqual([])
  })

  test('pinching out on a chip opens it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'touch events through CDP')
    await page.goto('/#tab=board&board=tiers')
    await mapLoaded(page)
    await expect(chip(page, 'backend')).toBeVisible()
    await pinchOut(page, await center(page, 'backend'))
    await expect(page.locator('.board-trail')).toContainText('Backend', { timeout: 5000 })
  })

  test('the sheet pulls up for the panels', async ({ page }) => {
    await page.goto('/#tab=board')
    await mapLoaded(page)
    const sheet = page.getByTestId('board-panel')
    const collapsed = (await sheet.boundingBox())!.height
    await sheet.getByRole('button', { name: 'Expand the panel' }).tap()
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeGreaterThan(collapsed + 100)
    await page.getByTestId('board-panel-rules').tap()
    await expect(page.getByTestId('board-rules')).toBeVisible()
  })
})
