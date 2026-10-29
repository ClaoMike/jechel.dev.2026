import { expect, test, type Page } from '@playwright/test'
import { commitRow, DEMO, hasNoHorizontalOverflow, serveSource, violations, watchErrors } from './helpers.ts'

/** The phone hides the repository name: wait for the board itself. */
const boardShown = (page: Page) => expect(page.getByTestId('board-svg')).toBeVisible({ timeout: 20_000 })

test.describe('the board on a phone', () => {
  test('fits the screen with a compact bar, and draws nothing in 3D', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    await boardShown(page)
    await expect(page.getByTestId('tab-board')).toBeVisible()
    await expect(page.getByTestId('tab-git')).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await hasNoHorizontalOverflow(page)).toBe(true)
    expect(errors).toEqual([])
  })

  test('the files are a tab of the sheet', async ({ page }) => {
    await page.goto('/')
    await boardShown(page)
    await page.getByRole('button', { name: 'Toggle the board panel' }).tap()
    await page.getByTestId('board-panel-files').tap()
    await expect(page.getByTestId('explorer')).toBeInViewport()
    await expect(page.getByTestId('explorer')).toContainText('web')
    expect(await hasNoHorizontalOverflow(page)).toBe(true)
  })

  test("a chip's code opens full screen", async ({ page }) => {
    await serveSource(page)
    await page.goto('/')
    await boardShown(page)
    await page.getByRole('button', { name: 'Toggle the board panel' }).tap()
    await page.getByTestId('board-search').fill('BookCard')
    await page.getByTestId('board-search').press('Enter')
    await page.getByTestId('board-read-code').tap()
    const code = page.getByTestId('code-viewer')
    await expect(code.locator('.cm-content')).toContainText('export function BookCard')
    const box = (await code.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
    expect(box.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1)
    await code.getByRole('button', { name: 'Close code' }).tap()
    await expect(code).toHaveCount(0)
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

  test('the board, its sheet, the history and its panels pass WCAG AA checks', async ({ page }) => {
    await page.goto('/')
    await boardShown(page)
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'Toggle the board panel' }).tap()
    await page.getByTestId('board-panel-files').tap()
    await expect(page.getByTestId('explorer')).toBeInViewport()
    expect(await violations(page)).toEqual([])

    await page.getByTestId('tab-git').tap()
    await commitRow(page, DEMO.head).tap()
    await expect(page.getByTestId('commit-details')).toBeVisible()
    expect(await violations(page)).toEqual([])
    await page.getByRole('button', { name: 'Toggle branches panel' }).tap()
    await expect(page.getByTestId('git-panel')).toBeInViewport()
    expect(await violations(page)).toEqual([])
  })
})
