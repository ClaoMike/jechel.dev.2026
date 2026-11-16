import { expect, test } from '@playwright/test'
import { commitRow, DEMO, graphLoaded, serveSource, violations } from './helpers.ts'

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    // Reduced motion: nothing is half-way through a fade when the page is checked.
    test.use({ colorScheme: theme, reducedMotion: 'reduce' })

    test('the board, a chip, the files, code and help', async ({ page }) => {
      await serveSource(page)
      await page.goto('/')
      await graphLoaded(page)
      await expect(page.locator('[data-chip="app"]')).toBeVisible()
      expect(await violations(page)).toEqual([])

      await page.getByTestId('board-search').fill('BookCard')
      await page.getByTestId('board-search').press('Enter')
      await expect(page.getByTestId('board-chip-details')).toContainText('BookCard')
      expect(await violations(page)).toEqual([])
      await page.getByTestId('board-read-code').click()
      await expect(page.getByTestId('code-viewer').locator('.cm-content')).toContainText('BookCard')
      expect(await violations(page)).toEqual([])
      await page.keyboard.press('Escape')

      await page.getByTestId('board-panel-files').click()
      await expect(page.getByTestId('explorer')).toBeVisible()
      expect(await violations(page)).toEqual([])

      await page.locator('.board-canvas').click({ position: { x: 4, y: 300 } })
      await page.keyboard.press('?')
      await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('the history, a commit and its help', async ({ page }) => {
      await page.goto('/#tab=git')
      await expect(page.getByTestId('commit-list')).toBeVisible()
      expect(await violations(page)).toEqual([])
      await commitRow(page, DEMO.merge12).click()
      await expect(page.getByTestId('commit-details')).toBeVisible()
      await page.getByTestId('git-search').fill('order')
      expect(await violations(page)).toEqual([])
      await page.getByTestId('git-search').press('Escape')
      await page.getByTestId('git-search').press('Escape')
      await page.keyboard.press('?')
      await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })
  })
}
