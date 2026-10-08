import { expect, test } from '@playwright/test'
import { BOOK_CARD, commitRow, DEMO, nodePosition, serveSource, violations } from './helpers.ts'

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    // Reduced motion: nothing is half-way through a fade when the page is checked.
    test.use({ colorScheme: theme, reducedMotion: 'reduce' })

    test('the map, its details, menu, code and help', async ({ page }) => {
      await serveSource(page)
      await page.goto('/')
      await expect(page.locator('.sidebar-footer').first()).toContainText('253/253 nodes')
      expect(await violations(page)).toEqual([])

      const at = await nodePosition(page, BOOK_CARD)
      await page.mouse.click(at.x, at.y, { button: 'right' })
      await expect(page.getByTestId('context-menu')).toBeVisible()
      expect(await violations(page)).toEqual([])
      await page.getByRole('menuitem').click()
      await expect(page.getByTestId('code-viewer').locator('.cm-content')).toContainText('BookCard')
      expect(await violations(page)).toEqual([])
      await page.keyboard.press('Escape')

      await page.getByTestId('search').fill('BooksPage')
      await page.getByTestId('search').press('Enter')
      await expect(page.getByTestId('details')).toBeVisible()
      expect(await violations(page)).toEqual([])

      await page.locator('.scene').click({ position: { x: 4, y: 4 } })
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
