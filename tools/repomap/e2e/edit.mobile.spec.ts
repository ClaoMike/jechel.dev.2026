/**
 * Editing and git commands on a phone: editing is switched on explicitly (a focused editor pops up
 * the keyboard), the command bar and the changes sheet fit the screen.
 */
import { hasNoHorizontalOverflow, watchErrors } from './helpers.ts'
import { BOOK_CARD_FILE, expect, test } from './repo-fixture.ts'

test.describe('editing on a phone', () => {
  test('opens the code read-only, edits after tapping Edit, saves', async ({ page, repo }) => {
    const errors = watchErrors(page)
    await page.goto(`${repo.url}/`)
    // The gesture hint shows once the map is loaded (searching before that finds nothing).
    await expect(page.getByTestId('hint')).toBeVisible()
    await page.getByRole('button', { name: 'Search' }).tap()
    await page.getByTestId('search').fill('BookCard')
    await page.getByTestId('search').press('Enter')
    await page.getByTestId('details').getByTestId('view-code').tap()
    const code = page.getByTestId('code-viewer')
    await expect(code.locator('.cm-content')).toContainText('export function BookCard')
    const edit = code.getByTestId('code-edit')
    await expect(edit).toHaveAttribute('aria-pressed', 'false')
    await expect(code.locator('.cm-content')).toHaveAttribute('aria-readonly', 'true')
    await edit.tap()
    await expect(code.locator('.cm-content')).toHaveAttribute('aria-readonly', 'false')
    await code.locator('.cm-line', { hasText: 'type Props' }).tap()
    await page.keyboard.press('End')
    await page.keyboard.type(' // phone')
    await expect(code.getByTestId('save-status')).toHaveText(/Saved/)
    expect(repo.read(BOOK_CARD_FILE)).toContain('// phone')
    await code.getByRole('button', { name: 'Close code' }).tap()
    await expect(code).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('commits from the history tab without sideways scrolling', async ({ page, repo }) => {
    repo.write('README.md', 'from a phone\n')
    await page.goto(`${repo.url}/#tab=git`)
    await expect(page.getByTestId('git-actions')).toBeVisible()
    expect(await hasNoHorizontalOverflow(page)).toBe(true)
    await page.getByTestId('changes-button').tap()
    const sheet = page.getByTestId('commit-details')
    await sheet.getByRole('button', { name: 'Expand details' }).tap()
    await sheet.getByTestId('commit-summary').fill('Edit on the go')
    await sheet.getByTestId('commit-button').tap()
    await expect(page.locator('.toast')).toContainText('Committed 1 file to main')
    expect(repo.git('log', '-1', '--format=%s')).toBe('Edit on the go')
    expect(await hasNoHorizontalOverflow(page)).toBe(true)
  })
})
