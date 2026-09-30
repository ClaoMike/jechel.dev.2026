/**
 * Creating, renaming and deleting files and folders from the explorer and the details panel, against
 * a real repository whose map is built by the real pipeline and rebuilt after every change: the new
 * file appears in the map on its layer's plane, a deleted one disappears. And read-only elsewhere.
 */
import type { Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mapLoaded, violations, watchErrors } from './helpers.ts'
import { BOOK_CARD_FILE, expect, test } from './repo-fixture.ts'

const BOOKS = 'web/src/features/books'
const dialog = (page: Page) => page.getByTestId('file-dialog')
const details = (page: Page) => page.getByTestId('details')

async function openExplorer(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/`)
  await mapLoaded(page)
  await page.getByTestId('sidebar-files').click()
  await expect(page.getByTestId('explorer')).toBeVisible()
}

/** Opens the ⋯ menu of an explorer row and picks an item. */
async function rowMenu(page: Page, path: string, item: string | RegExp): Promise<void> {
  await page.getByTestId(`explorer-menu-${path}`).click()
  await page.getByTestId(`explorer-menu-${path}-menu`).getByRole('menuitem', { name: item }).click()
}

async function expandTo(page: Page, folder: string): Promise<void> {
  const parts = folder.split('/')
  for (let i = 1; i <= parts.length; i++) {
    const row = page.getByTestId(`folder-${parts.slice(0, i).join('/')}`).locator('.explorer-main')
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click()
  }
}

test.describe('files', () => {
  test.use({ realMap: true })

  test('creates a component from the explorer: it opens in the editor and lands on the Frontend plane', async ({ page, repo }) => {
    const errors = watchErrors(page)
    await openExplorer(page, repo.url)
    await expandTo(page, BOOKS)
    await expect(page.getByTestId(`file-${BOOK_CARD_FILE}`)).toBeVisible()
    await rowMenu(page, BOOKS, 'New file here…')
    const path = dialog(page).getByTestId('file-path')
    await expect(path).toHaveValue(`${BOOKS}/`)
    await path.pressSequentially('BookList.tsx')
    await expect(dialog(page).getByTestId('placement')).toContainText('Frontend')
    await expect(dialog(page).getByTestId('placement')).toContainText('Production')
    await expect(dialog(page)).toContainText('Start with: React component BookList')
    await dialog(page).getByRole('button', { name: 'Create' }).click()

    const code = page.getByTestId('code-viewer')
    await expect(code.locator('.cm-content')).toContainText('export function BookList()', { timeout: 15_000 })
    expect(repo.read(`${BOOKS}/BookList.tsx`)).toBe('export function BookList() {\n  return <div>BookList</div>\n}\n')
    await page.keyboard.press('Escape')
    await expect(code).toHaveCount(0)

    // The rebuilt map has it, selected, on the Frontend plane.
    await expect(details(page).getByRole('heading', { name: 'BookList' })).toBeVisible({ timeout: 20_000 })
    await expect(details(page)).toContainText('Frontend')
    await expect(details(page).locator('.location')).toContainText(`${BOOKS}/BookList.tsx`)
    await expect(page.getByTestId(`file-${BOOKS}/BookList.tsx`)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('renames, moves and deletes a file from the details panel', async ({ page, repo }) => {
    await page.goto(`${repo.url}/`)
    await mapLoaded(page)
    await page.getByTestId('search').fill('BookCard')
    await page.getByTestId('search').press('Enter')
    await expect(details(page).getByRole('heading', { name: 'BookCard' })).toBeVisible()
    const commands = details(page).getByTestId('file-commands')

    await commands.getByRole('button', { name: 'Rename or move…' }).click()
    const path = dialog(page).getByTestId('file-path')
    await expect(path).toHaveValue(BOOK_CARD_FILE)
    // The name is selected, not the folder or the extension.
    await page.keyboard.type('Card')
    await expect(path).toHaveValue(`${BOOKS}/Card.tsx`)
    await path.fill('web/src/shared/Card.tsx')
    await expect(dialog(page).getByRole('button', { name: 'Move' })).toBeEnabled()
    await dialog(page).getByRole('button', { name: 'Move' }).click()
    await expect(details(page).locator('.location')).toContainText('web/src/shared/Card.tsx', { timeout: 20_000 })
    expect(existsSync(join(repo.dir, BOOK_CARD_FILE))).toBe(false)
    expect(repo.read('web/src/shared/Card.tsx')).toContain('export function BookCard')

    await details(page).getByTestId('file-commands').getByRole('button', { name: 'Delete…' }).click()
    await expect(dialog(page)).toContainText('web/src/shared/Card.tsx')
    await dialog(page).getByRole('button', { name: 'Delete' }).click()
    await expect(details(page)).toHaveCount(0, { timeout: 20_000 })
    expect(existsSync(join(repo.dir, 'web/src/shared/Card.tsx'))).toBe(false)
    // Nothing in the map is called BookCard any more.
    await page.getByTestId('search').fill('BookCard')
    await expect(page.locator('.search-results')).toContainText('No matches')
    await expect(page.locator('.search-results [role="option"]')).toHaveCount(0)
  })

  test('deletes a folder, and the git tab can take it back', async ({ page, repo }) => {
    await openExplorer(page, repo.url)
    await expandTo(page, 'web/src')
    await rowMenu(page, 'web/src/features', 'Delete folder…')
    await expect(dialog(page)).toContainText('the 1 file in it')
    await dialog(page).getByRole('button', { name: 'Delete 1 file' }).click()
    await expect(page.getByTestId('folder-web/src/features')).toHaveCount(0)
    expect(existsSync(join(repo.dir, 'web/src/features'))).toBe(false)
    expect(repo.git('status', '--porcelain')).toBe(`D ${BOOK_CARD_FILE}`)

    // Deleted files are uncommitted changes: discard brings them back.
    await page.getByTestId('tab-git').click()
    await page.getByTestId('changes-button').click()
    await page.getByTestId('change-list').getByRole('button', { name: `Discard ${BOOK_CARD_FILE}` }).click()
    await page.getByTestId('git-dialog').getByRole('button', { name: 'Discard changes' }).click()
    await expect.poll(() => existsSync(join(repo.dir, BOOK_CARD_FILE))).toBe(true)
    await page.getByTestId('tab-map').click()
    await expect(page.getByTestId(`folder-web/src/features`)).toBeVisible({ timeout: 20_000 })
  })

  test('the new-file dialog refuses paths that exist or leave the repository', async ({ page, repo }) => {
    await openExplorer(page, repo.url)
    await page.getByTestId('explorer-new-file').click()
    const path = dialog(page).getByTestId('file-path')
    const create = dialog(page).getByRole('button', { name: 'Create' })
    await path.fill(BOOK_CARD_FILE)
    await expect(dialog(page).getByRole('alert')).toContainText('already exists')
    await expect(create).toBeDisabled()
    await path.fill('../outside.txt')
    await expect(dialog(page).getByRole('alert')).toContainText('without ".."')
    await path.fill('.git/hooks/pre-commit')
    await expect(dialog(page).getByRole('alert')).toContainText('.git')
    await path.fill('web')
    await expect(dialog(page).getByRole('alert')).toContainText('is a folder')
    await path.fill('docs/notes.md')
    await expect(create).toBeEnabled()
    await expect(dialog(page).getByTestId('placement')).toContainText('Infra')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
  })

  test('the explorer and the new-file dialog meet WCAG 2.1 AA', async ({ page, repo }) => {
    await openExplorer(page, repo.url)
    await expandTo(page, BOOKS)
    expect(await violations(page), 'explorer').toEqual([])
    await page.getByTestId('explorer-new-file').click()
    await dialog(page).getByTestId('file-path').fill('web/src/New.tsx')
    await expect(dialog(page).getByTestId('placement')).toBeVisible()
    expect(await violations(page), 'new file dialog').toEqual([])
  })
})

test('on a read-only server the explorer lists the map files and changes nothing', async ({ page }) => {
  await page.goto('/')
  await mapLoaded(page)
  await page.getByTestId('sidebar-files').click()
  await expect(page.getByTestId('explorer')).toContainText('Read-only')
  await expect(page.getByTestId('explorer-new-file')).toHaveCount(0)
  await page.getByTestId('explorer-filter').fill('BookCard')
  await expect(page.getByTestId(`file-${BOOK_CARD_FILE}`)).toBeVisible()
  await page.getByTestId(`explorer-menu-${BOOK_CARD_FILE}`).click()
  await expect(page.getByTestId(`explorer-menu-${BOOK_CARD_FILE}-menu`).getByRole('menuitem', { name: 'Delete…' })).toBeDisabled()
  await page.keyboard.press('Escape')
  // Clicking a file finds it in the map.
  await page.getByTestId(`file-${BOOK_CARD_FILE}`).locator('.explorer-main').click()
  await expect(details(page).getByRole('heading', { name: 'BookCard' })).toBeVisible()
  await expect(details(page).getByTestId('file-commands')).toHaveCount(0)
})
