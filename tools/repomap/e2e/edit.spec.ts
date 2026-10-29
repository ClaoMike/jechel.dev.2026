/**
 * Editing a file in the code panel, against a real repository served by repomap: typing, autosave,
 * ⌘S, undo, closing with unsaved text, a file changed on disk (unedited: reloaded; edited: you
 * choose), and read-only when the server doesn't allow editing.
 */
import type { Page } from '@playwright/test'
import { BOOK_CARD_SOURCE, graphLoaded, serveSource, watchErrors } from './helpers.ts'
import { BOOK_CARD_FILE, expect, test } from './repo-fixture.ts'

/** Opens BookCard's code from the search, the way a user does. */
async function openBookCard(page: Page, url = ''): Promise<ReturnType<Page['getByTestId']>> {
  await page.goto(`${url}/`)
  await graphLoaded(page)
  await page.getByTestId('board-search').fill('BookCard')
  await page.getByTestId('board-search').press('Enter')
  await page.getByTestId('board-read-code').click()
  const code = page.getByTestId('code-viewer')
  // The editor is its own chunk: its first load can be slow on a busy machine.
  await expect(code.locator('.cm-content')).toContainText('export function BookCard', { timeout: 15_000 })
  return code
}

/** Puts the cursor at the end of a line of the editor. */
async function endOfLine(page: Page, code: ReturnType<Page['getByTestId']>, text: string): Promise<void> {
  await code.locator('.cm-line', { hasText: text }).click()
  await page.keyboard.press('End')
}

const status = (code: ReturnType<Page['getByTestId']>) => code.getByTestId('save-status')

test.describe('editing code', () => {
  test('types into the file and saves it automatically', async ({ page, repo }) => {
    const errors = watchErrors(page)
    const code = await openBookCard(page, repo.url)
    await expect(status(code)).toHaveText(/Autosave on/)
    await expect(code.getByTestId('code-edit')).toHaveAttribute('aria-pressed', 'true')
    await expect(code.locator('.cm-content')).toHaveAttribute('aria-readonly', 'false')

    await endOfLine(page, code, "type Props = { title: string }")
    await page.keyboard.type('\n// rated books')
    await expect(status(code)).toHaveAttribute('data-status', /pending|saving|saved/)
    await expect(status(code)).toHaveText(/Saved/)
    expect(repo.read(BOOK_CARD_FILE)).toBe(BOOK_CARD_SOURCE.replace('type Props = { title: string }', 'type Props = { title: string }\n// rated books'))
    await expect(code.locator('.code-status')).toContainText('9 lines')

    // Undo is saved too: the file is back as it was.
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => repo.read(BOOK_CARD_FILE)).toBe(BOOK_CARD_SOURCE)
    // The history tab sees the file as it is: no changes left.
    expect(repo.git('status', '--porcelain')).toBe('')
    expect(errors).toEqual([])
  })

  test('⌘S saves at once, and closing saves what is left', async ({ page, repo }) => {
    const code = await openBookCard(page, repo.url)
    await endOfLine(page, code, 'export function BookCard')
    await page.keyboard.type(' // card')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => repo.read(BOOK_CARD_FILE)).toContain('export function BookCard({ title }: Props) { // card')
    await expect(status(code)).toHaveText(/Saved/)

    await page.keyboard.type('!')
    await page.keyboard.press('Escape')
    await expect(code).toHaveCount(0)
    expect(repo.read(BOOK_CARD_FILE)).toContain('// card!')
  })

  test('shows a file changed on disk; with edits of its own, lets you choose', async ({ page, repo }) => {
    const code = await openBookCard(page, repo.url)
    // Changed elsewhere, nothing typed here: reloaded when the window gets the focus back.
    repo.write(BOOK_CARD_FILE, BOOK_CARD_SOURCE.replace("import { Link } from 'react-router'", "import { Link, useParams } from 'react-router'"))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(code.locator('.cm-content')).toContainText('useParams')
    await expect(page.getByRole('status').filter({ hasText: 'changed on disk: reloaded' })).toBeVisible()

    // Now typed here and changed on disk before the save: nothing is overwritten.
    await endOfLine(page, code, 'type Props')
    await page.keyboard.type(' // mine')
    repo.write(BOOK_CARD_FILE, 'theirs\n')
    const conflict = code.getByTestId('save-conflict')
    await expect(conflict).toBeVisible()
    await expect(status(code)).toHaveText(/Changed on disk/)
    expect(repo.read(BOOK_CARD_FILE)).toBe('theirs\n')
    await conflict.getByRole('button', { name: 'Keep mine' }).click()
    await expect(conflict).toHaveCount(0)
    await expect.poll(() => repo.read(BOOK_CARD_FILE)).toContain('type Props = { title: string } // mine')

    // Again, and this time take the disk version.
    await endOfLine(page, code, 'type Props')
    await page.keyboard.type('!')
    repo.write(BOOK_CARD_FILE, 'theirs again\n')
    await expect(conflict).toBeVisible()
    await conflict.getByRole('button', { name: 'Load the disk version' }).click()
    await expect(code.locator('.cm-content')).toHaveText('theirs again')
    await expect(status(code)).toHaveAttribute('data-status', 'saved')
    expect(repo.read(BOOK_CARD_FILE)).toBe('theirs again\n')
  })

  test('the edit switch makes the file read-only and back', async ({ page, repo }) => {
    const code = await openBookCard(page, repo.url)
    const edit = code.getByTestId('code-edit')
    await edit.click()
    await expect(edit).toHaveAttribute('aria-pressed', 'false')
    await expect(code.locator('.cm-content')).toHaveAttribute('aria-readonly', 'true')
    await endOfLine(page, code, 'type Props')
    await page.keyboard.type('ignored')
    await expect(code.locator('.cm-content')).not.toContainText('ignored')
    await edit.click()
    await endOfLine(page, code, 'type Props')
    await page.keyboard.type(' // ok')
    await expect.poll(() => repo.read(BOOK_CARD_FILE)).toContain('// ok')
  })

  test('keeps line endings and says which', async ({ page, repo }) => {
    repo.write(BOOK_CARD_FILE, BOOK_CARD_SOURCE.replace(/\n/g, '\r\n'))
    const code = await openBookCard(page, repo.url)
    await expect(code.locator('.code-status')).toContainText('CRLF')
    await endOfLine(page, code, 'type Props')
    await page.keyboard.type('\n// windows')
    await expect.poll(() => repo.read(BOOK_CARD_FILE)).toContain('type Props = { title: string }\r\n// windows\r\n')
    expect(repo.read(BOOK_CARD_FILE)).not.toMatch(/[^\r]\n/)
  })

  test('is read-only when the server does not allow editing', async ({ page }) => {
    await serveSource(page)
    const code = await openBookCard(page)
    await expect(status(code)).toHaveText(/Read-only/)
    await expect(code.getByTestId('code-edit')).toHaveCount(0)
    await expect(code.locator('.cm-content')).toHaveAttribute('aria-readonly', 'true')
    await endOfLine(page, code, 'type Props')
    await page.keyboard.type('nope')
    await expect(code.locator('.cm-content')).not.toContainText('nope')
  })
})
