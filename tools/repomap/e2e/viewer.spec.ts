import { expect, test } from '@playwright/test'
import { graphLoaded, watchErrors } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await graphLoaded(page)
})

test('opens on the board of the demo graph, without errors and without any 3D scene', async ({ page }) => {
  const errors = watchErrors(page)
  await expect(page.locator('.repo')).toContainText('bookshelf (demo)')
  await expect(page.locator('#tab-board')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-chip="app"]')).toBeVisible()
  // The views are the Board and the history: nothing draws in WebGL.
  const views = page.getByRole('tablist', { name: 'Views' }).getByRole('tab')
  await expect(views).toHaveCount(2)
  await expect(views.nth(0)).toContainText('Board')
  await expect(views.nth(1)).toContainText('Git history')
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})

test('search finds a chip and opens the board where it is', async ({ page }) => {
  const errors = watchErrors(page)
  await page.getByTestId('board-search').fill('BooksPage')
  await page.getByTestId('board-search').press('Enter')
  await expect(page.getByTestId('board-chip-details')).toContainText('BooksPage')
  await expect(page.locator('.board-trail')).toContainText('Book')
  expect(errors).toEqual([])
})

test('help opens with ? and closes with Escape', async ({ page }) => {
  await page.locator('.board-canvas').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('?')
  const help = page.getByRole('dialog', { name: 'Help' })
  await expect(help).toBeVisible()
  await expect(help).toContainText('How to read and drive the board')
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
})
