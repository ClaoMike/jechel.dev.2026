import { expect, test } from '@playwright/test'
import { BOOK_CARD, commitRow, DEMO, hasNoHorizontalOverflow, nodePosition, serveSource, violations, watchErrors } from './helpers.ts'

test.describe('architecture map on a phone', () => {
  test('fits the screen with a compact bar', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    await expect(page.locator('.scene canvas').first()).toBeVisible()
    await expect(page.getByTestId('tab-map')).toBeVisible()
    await expect(page.getByTestId('tab-map')).toContainText('Map')
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
    await expect(page.getByTestId('search')).toBeHidden()
    await expect(page.getByTestId('sidebar')).not.toBeInViewport()
    await expect(page.getByTestId('hint')).toContainText('long-press')
    expect(await hasNoHorizontalOverflow(page)).toBe(true)
    expect(errors).toEqual([])
  })

  test('filters open as a drawer', async ({ page }) => {
    await page.goto('/')
    const drawer = page.getByTestId('sidebar')
    await page.getByRole('button', { name: 'Toggle filters' }).tap()
    await expect(drawer).toBeInViewport()
    await drawer.getByTestId('layer-backend').getByRole('checkbox').tap()
    await expect(drawer.locator('.sidebar-footer')).not.toContainText('253/253')
    await page.getByRole('button', { name: 'Close filters' }).tap()
    await expect(drawer).not.toBeInViewport()
    await page.getByRole('button', { name: 'Toggle filters' }).tap()
    await expect(drawer).toBeInViewport()
    await page.touchscreen.tap(page.viewportSize()!.width - 12, 420) // the backdrop, right of the drawer
    await expect(drawer).not.toBeInViewport()
  })

  test('tapping a node opens its details as a bottom sheet', async ({ page }) => {
    await page.goto('/')
    const at = await nodePosition(page, BOOK_CARD)
    await page.touchscreen.tap(at.x, at.y)
    const sheet = page.getByTestId('details')
    await expect(sheet.getByRole('heading', { name: 'BookCard' })).toBeVisible()
    const box = (await sheet.boundingBox())!
    expect(box.y).toBeGreaterThan(page.viewportSize()!.height * 0.4)
    await expect(page.getByTestId('hint')).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Expand details' }).tap()
    await expect(sheet).toHaveClass(/expanded/)
    await sheet.getByRole('button', { name: 'Close details' }).tap()
    await expect(sheet).toHaveCount(0)
  })

  test('a long press opens the code, full screen', async ({ page }) => {
    await serveSource(page)
    await page.goto('/')
    const at = await nodePosition(page, BOOK_CARD)
    const scene = page.getByTestId('scene')
    const pointer = { clientX: at.x, clientY: at.y, pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, bubbles: true }
    await scene.dispatchEvent('pointerdown', pointer)
    await page.waitForTimeout(700)
    await scene.dispatchEvent('pointerup', pointer)
    await expect(page.getByTestId('context-menu')).toContainText('BookCard')
    await page.getByRole('menuitem').tap()
    const code = page.getByTestId('code-viewer')
    await expect(code.locator('.cm-content')).toContainText('export function BookCard')
    const box = (await code.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
    expect(box.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1)
    await code.getByRole('button', { name: 'Close code' }).tap()
    await expect(code).toHaveCount(0)
  })

  test('search expands over the bar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Search' }).tap()
    const input = page.getByTestId('search')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused()
    await input.fill('BookCard')
    await page.locator('.search-results li').first().tap()
    await expect(page.getByTestId('details').getByRole('heading', { name: 'BookCard' })).toBeVisible()
    await expect(input).toBeHidden()
  })

  test('view options hold the camera, colours, labels and theme', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'View options' }).tap()
    const menu = page.getByTestId('view-menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('button', { name: 'Layer', exact: true }).tap()
    await expect(menu.getByRole('button', { name: 'Layer', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await menu.getByRole('button', { name: 'Side' }).tap()
    await expect(menu).toHaveCount(0)
    expect(await hasNoHorizontalOverflow(page)).toBe(true)
  })
})

test.describe('git history on a phone', () => {
  test('works with a thumb', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    await page.getByTestId('tab-git').tap()
    await expect(page.getByTestId('commit-list')).toBeVisible()
    expect(await hasNoHorizontalOverflow(page)).toBe(true)

    await commitRow(page, DEMO.head).tap()
    const sheet = page.getByTestId('commit-details')
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Wishlist page')
    const row = (await commitRow(page, DEMO.head).boundingBox())!
    const panel = (await sheet.boundingBox())!
    expect(row.y + row.height).toBeLessThanOrEqual(panel.y + 1)

    await page.getByRole('button', { name: 'Toggle branches panel' }).tap()
    await expect(page.getByTestId('git-panel')).toBeInViewport()
    await page.getByRole('button', { name: 'Close branches panel' }).tap()
    await expect(page.getByTestId('git-panel')).not.toBeInViewport()

    await page.getByRole('button', { name: 'View options' }).tap()
    await page.getByTestId('view-menu').getByRole('button', { name: 'Tags' }).tap()
    await expect(page.locator('.git-row .ref-badge.tag')).toHaveCount(0)
    await page.getByRole('button', { name: 'View options' }).tap()
    await expect(page.getByTestId('view-menu')).toHaveCount(0)

    await page.getByRole('button', { name: 'Search' }).tap()
    await page.getByTestId('git-search').fill('#12')
    await page.getByTestId('git-search').press('Enter')
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(/Merge pull request #12/)
    expect(errors).toEqual([])
  })
})

test.describe('accessibility on a phone', () => {
  test.use({ reducedMotion: 'reduce' })

  test('drawers, sheets and menus pass WCAG AA checks', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.scene canvas').first()).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'Toggle filters' }).tap()
    await expect(page.getByTestId('sidebar')).toBeInViewport()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'Close filters' }).tap()
    await page.getByRole('button', { name: 'View options' }).tap()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'View options' }).tap()

    await page.getByTestId('tab-git').tap()
    await commitRow(page, DEMO.head).tap()
    await expect(page.getByTestId('commit-details')).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'Toggle branches panel' }).tap()
    await expect(page.getByTestId('git-panel')).toBeInViewport()
    expect(await violations(page)).toEqual([])
  })
})
