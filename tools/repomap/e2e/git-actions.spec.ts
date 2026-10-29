/**
 * Git commands from the History tab, clicked through against a real repository with a remote:
 * commit (only the ticked files), branches, publish/push, fetch/pull, merge with a conflict resolved
 * in the code panel, commit actions (tag, revert, undo, cherry-pick), discard, stash, failures.
 */
import type { Page } from '@playwright/test'
import { commitRow, violations, watchErrors } from './helpers.ts'
import { BOOK_CARD_FILE, expect, test, type Repo } from './repo-fixture.ts'

const bar = (page: Page) => page.getByTestId('git-actions')
const details = (page: Page) => page.getByTestId('commit-details')
const dialog = (page: Page) => page.getByTestId('git-dialog')
const toast = (page: Page, text: string | RegExp) => page.locator('.toast').filter({ hasText: text })

async function openHistory(page: Page, repo: Repo): Promise<void> {
  await page.goto(`${repo.url}/#tab=git`)
  await expect(page.getByTestId('commit-list')).toBeVisible()
  await expect(bar(page)).toBeVisible()
}

/** Picks an item of a menu opened from a button. */
async function menu(page: Page, testId: string, item: string | RegExp): Promise<void> {
  await page.getByTestId(testId).click()
  await page.getByTestId(`${testId}-menu`).getByRole('menuitem', { name: item, exact: typeof item === 'string' }).click()
}

test.describe('git commands', () => {
  test('commits only the ticked files, with a summary and description', async ({ page, repo }) => {
    const errors = watchErrors(page)
    repo.write('README.md', '# Bookshelf\n\nChanged.\n')
    repo.write('docs/notes.md', 'notes\n')
    await openHistory(page, repo)
    await expect(page.getByTestId('current-branch')).toHaveText('main')
    await page.getByTestId('changes-button').click()
    const changes = page.getByTestId('change-list')
    await expect(changes.locator('li')).toHaveCount(2)
    await changes.getByRole('checkbox', { name: 'Include docs/notes.md in the commit' }).uncheck()
    const commit = page.getByTestId('commit-button')
    await expect(commit).toBeDisabled()
    await page.getByTestId('commit-summary').fill('Explain the change')
    await page.getByRole('textbox', { name: 'Commit description' }).fill('Longer text.')
    await expect(commit).toHaveText('Commit 1 file to main')
    await commit.click()

    await expect(toast(page, 'Committed 1 file to main')).toBeVisible()
    expect(repo.git('log', '-1', '--format=%B')).toBe('Explain the change\n\nLonger text.')
    expect(repo.git('show', '--name-only', '--format=', 'HEAD')).toBe('README.md')
    expect(repo.git('status', '--porcelain', '--untracked-files=all')).toBe('?? docs/notes.md')
    // The new commit is in the graph, selected, and the branch is one ahead.
    await expect(details(page).getByRole('heading', { level: 2 })).toHaveText('Explain the change')
    await expect(page.getByTestId('sync')).toContainText('Push origin')
    await expect(page.getByTestId('sync')).toContainText('↑1')
    expect(errors).toEqual([])
  })

  test('pushes, and publishes a new branch', async ({ page, repo }) => {
    repo.write('README.md', 'x\n')
    repo.git('commit', '-qam', 'Local commit')
    await openHistory(page, repo)
    await page.getByTestId('sync').click()
    await expect(toast(page, 'Pushed main to origin/main')).toBeVisible()
    await expect(page.getByTestId('sync')).toContainText('Fetch origin')
    expect(repo.git('rev-parse', 'origin/main')).toBe(repo.git('rev-parse', 'HEAD'))

    await menu(page, 'branch-menu', /^New branch…/)
    await dialog(page).getByTestId('branch-name').fill('feature/shelves')
    await dialog(page).getByRole('button', { name: 'Create and switch' }).click()
    await expect(page.getByTestId('current-branch')).toHaveText('feature/shelves')
    await expect(page.getByTestId('sync')).toContainText('Publish branch')
    await page.getByTestId('sync').click()
    await expect(toast(page, 'Published feature/shelves to origin')).toBeVisible()
    expect(repo.git('ls-remote', '--heads', 'origin', 'feature/shelves')).toContain('refs/heads/feature/shelves')
    await expect(page.getByTestId('git-panel').getByTestId('ref-branch:feature/shelves')).toBeVisible()
  })

  test('menus work with the keyboard, and Escape closes only the menu', async ({ page, repo }) => {
    repo.write('README.md', 'changed\n')
    await openHistory(page, repo)
    await page.getByTestId('changes-button').click()
    await expect(page.getByTestId('commit-form')).toBeVisible()
    await page.getByTestId('branch-menu').click()
    const items = page.getByTestId('branch-menu-menu').getByRole('menuitem')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('branch-menu-menu').getByRole('menuitem', { name: /^New branch/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('branch-menu-menu')).toHaveCount(0)
    await expect(page.getByTestId('branch-menu')).toBeFocused()
    await expect(page.getByTestId('commit-form')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(items.first()).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('current-branch')).toHaveText('feature/reviews')
  })

  test('rejects bad branch names before asking git', async ({ page, repo }) => {
    await openHistory(page, repo)
    await page.getByTestId('new-branch').click()
    const name = dialog(page).getByTestId('branch-name')
    await name.fill('feature..x')
    await expect(dialog(page).getByRole('alert')).toContainText('No ".."')
    await expect(dialog(page).getByRole('button', { name: 'Create and switch' })).toBeDisabled()
    await name.fill('feature/reviews')
    await expect(dialog(page).getByRole('alert')).toContainText('already exists')
    await name.fill('fix login')
    await expect(name).toHaveValue('fix-login')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
  })

  test('fetches and pulls what a teammate pushed', async ({ page, repo }) => {
    await openHistory(page, repo)
    repo.teammateGit('commit', '--allow-empty', '-qm', 'Teammate work')
    repo.teammateGit('push', '-q')
    await page.getByTestId('sync').click()
    await expect(toast(page, 'Fetched')).toBeVisible()
    await expect(page.getByTestId('sync')).toContainText('Pull origin')
    await expect(page.getByTestId('sync')).toContainText('↓1')
    await page.getByTestId('sync').click()
    await expect(toast(page, 'Pulled origin/main into main')).toBeVisible()
    expect(repo.git('log', '-1', '--format=%s')).toBe('Teammate work')
    await expect(page.getByTestId('commit-list')).toContainText('Teammate work')
  })

  test('merges a branch, resolving the conflict in the code panel', async ({ page, repo }) => {
    const errors = watchErrors(page)
    repo.write(BOOK_CARD_FILE, repo.read(BOOK_CARD_FILE).replace('{title}</article>', '{title} (new)</article>'))
    repo.git('commit', '-qam', 'Mark new books')
    await openHistory(page, repo)

    await menu(page, 'branch-menu', 'Merge into main…')
    await dialog(page).getByRole('option', { name: /^feature\/reviews/ }).click()
    await dialog(page).getByRole('button', { name: 'Merge feature/reviews' }).click()
    await expect(page.getByTestId('git-failure')).toContainText('CONFLICT')
    const banner = page.getByTestId('operation-banner')
    await expect(banner).toContainText('Merge in progress')
    await expect(banner).toContainText('1 file has conflicts')

    await banner.getByRole('button', { name: 'Show conflicts' }).click()
    const row = page.getByTestId('change-list').locator('li', { hasText: 'BookCard.tsx' })
    await expect(row).toHaveClass(/conflicted/)
    // Committing a merge with markers left is refused.
    await banner.getByRole('button', { name: 'Commit merge' }).click()
    await expect(page.getByTestId('git-failure')).toContainText('Resolve the conflicts first')

    // Resolve it in the editor.
    await row.getByRole('button', { name: `Edit ${BOOK_CARD_FILE}` }).click()
    const code = page.getByTestId('code-viewer')
    await expect(code.locator('.cm-content')).toContainText('<<<<<<<')
    await code.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type("export function BookCard({ title }: { title: string }) {\n  return <article>{title} (new) ★★★★☆</article>\n}\n")
    await page.keyboard.press('Escape')
    await expect(code).toHaveCount(0)
    expect(repo.read(BOOK_CARD_FILE)).not.toContain('<<<<<<<')

    await banner.getByRole('button', { name: 'Commit merge' }).click()
    await expect(toast(page, 'Committed the merge')).toBeVisible()
    await expect(banner).toHaveCount(0)
    expect(repo.git('rev-list', '--count', '--merges', 'HEAD')).toBe('1')
    expect(repo.git('show', 'HEAD:' + BOOK_CARD_FILE)).toContain('(new) ★★★★☆')
    expect(errors.filter((e) => !e.includes('409') && !e.includes('400'))).toEqual([])
  })

  test('aborts a merge', async ({ page, repo }) => {
    repo.write(BOOK_CARD_FILE, 'conflicting\n')
    repo.git('commit', '-qam', 'Conflicting change')
    await openHistory(page, repo)
    await page.getByTestId('git-panel').getByTestId('ref-branch:feature/reviews').hover()
    await menu(page, 'ref-menu-branch:feature/reviews', 'Merge into main')
    const banner = page.getByTestId('operation-banner')
    await expect(banner).toBeVisible()
    await banner.getByRole('button', { name: 'Abort' }).click()
    await dialog(page).getByRole('button', { name: 'Abort' }).click()
    await expect(banner).toHaveCount(0)
    expect(repo.git('status', '--porcelain')).toBe('')
    expect(repo.read(BOOK_CARD_FILE)).toBe('conflicting\n')
  })

  test('switches branches, and deletes one', async ({ page, repo }) => {
    await openHistory(page, repo)
    await menu(page, 'branch-menu', 'feature/reviews')
    await expect(page.getByTestId('current-branch')).toHaveText('feature/reviews')
    expect(repo.git('branch', '--show-current')).toBe('feature/reviews')
    await menu(page, 'branch-menu', /^main/)
    await expect(page.getByTestId('current-branch')).toHaveText('main')

    await page.getByTestId('git-panel').getByTestId('ref-branch:feature/reviews').hover()
    await menu(page, 'ref-menu-branch:feature/reviews', 'Delete…')
    await dialog(page).getByRole('checkbox', { name: /Delete even if/ }).check()
    await dialog(page).getByRole('checkbox', { name: /Also delete/ }).check()
    await dialog(page).getByRole('button', { name: 'Delete' }).click()
    await expect(toast(page, 'Deleted feature/reviews on origin')).toBeVisible()
    expect(repo.git('branch', '--list', 'feature/reviews')).toBe('')
    expect(repo.git('ls-remote', '--heads', 'origin', 'feature/reviews')).toBe('')
    await expect(page.getByTestId('git-panel').getByTestId('ref-branch:feature/reviews')).toHaveCount(0)
  })

  test('tags, reverts, undoes and cherry-picks commits', async ({ page, repo }) => {
    await openHistory(page, repo)
    const head = repo.git('rev-parse', 'HEAD')
    await commitRow(page, head.slice(0, 7)).click()
    const actions = details(page).getByTestId('commit-actions')

    await actions.getByRole('button', { name: 'Tag…' }).click()
    await dialog(page).getByTestId('tag-name').fill('v1.0.0')
    await dialog(page).getByRole('textbox', { name: /Message/ }).fill('First release')
    await dialog(page).getByRole('button', { name: 'Create tag' }).click()
    await expect(toast(page, 'as v1.0.0')).toBeVisible()
    expect(repo.git('tag', '-l', '--format=%(contents:subject)', 'v1.0.0')).toBe('First release')
    await expect(commitRow(page, head.slice(0, 7)).locator('.ref-badge.tag')).toContainText('v1.0.0')

    await actions.getByRole('button', { name: 'Revert' }).click()
    await dialog(page).getByRole('button', { name: 'Revert' }).click()
    await expect(toast(page, `Reverted ${head.slice(0, 7)}`)).toBeVisible()
    expect(repo.git('log', '-1', '--format=%s')).toBe('Revert "Describe the project"')

    // The revert is the new HEAD: take it back.
    const revert = repo.git('rev-parse', 'HEAD')
    await commitRow(page, revert.slice(0, 7)).click()
    await details(page).getByTestId('commit-actions').getByRole('button', { name: 'Undo commit' }).click()
    await expect(toast(page, /Undid/)).toBeVisible()
    expect(repo.git('rev-parse', 'HEAD')).toBe(head)
    expect(repo.git('status', '--porcelain')).toBe('M  README.md')
    repo.git('reset', '-q', '--hard')

    const rating = repo.git('rev-parse', 'feature/reviews')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await commitRow(page, rating.slice(0, 7)).click()
    await details(page).getByTestId('commit-actions').getByRole('button', { name: 'Cherry-pick onto main' }).click()
    await expect(toast(page, `Cherry-picked ${rating.slice(0, 7)}`)).toBeVisible()
    expect(repo.git('log', '-1', '--format=%s')).toBe('Show the rating')
  })

  test('discards and stashes changes', async ({ page, repo }) => {
    repo.write('README.md', 'scratch\n')
    repo.write('tmp.txt', 'temporary\n')
    await openHistory(page, repo)
    await page.getByTestId('changes-button').click()
    const changes = page.getByTestId('change-list')
    await changes.getByRole('button', { name: 'Discard tmp.txt' }).click()
    await expect(dialog(page)).toContainText('The file is new: it will be deleted')
    await dialog(page).getByRole('button', { name: 'Discard changes' }).click()
    await expect(changes.locator('li')).toHaveCount(1)
    expect(repo.git('diff', '--name-only')).toBe('README.md')
    expect(repo.git('status', '--porcelain', '--untracked-files=all')).toMatch(/^M README\.md$/) // " M", trimmed

    await menu(page, 'git-more', 'Stash all changes…')
    await dialog(page).getByTestId('stash-message').fill('half an idea')
    await dialog(page).getByRole('button', { name: 'Stash' }).click()
    await expect(toast(page, 'Stashed the changes')).toBeVisible()
    expect(repo.git('status', '--porcelain')).toBe('')
    await expect(page.getByTestId('changes-button')).toHaveCount(0)

    await menu(page, 'git-more', /Restore “On main: half an idea”/)
    await expect(toast(page, /Restored/)).toBeVisible()
    expect(repo.read('README.md')).toBe('scratch\n')
  })

  test("shows git's message when a command fails", async ({ page, repo }) => {
    repo.teammateGit('commit', '--allow-empty', '-qm', 'Teammate work')
    repo.teammateGit('push', '-q')
    repo.git('commit', '--allow-empty', '-qm', 'Mine')
    await openHistory(page, repo)
    // Not fetched yet: the button offers a push, which the remote rejects.
    await page.getByTestId('sync').click()
    const failure = page.getByTestId('git-failure')
    await expect(failure).toContainText("The remote has commits you don't have yet")
    await failure.getByRole('button', { name: 'Show output' }).click()
    await expect(failure.locator('.git-output')).toContainText('[rejected]')
    await failure.getByRole('button', { name: 'Dismiss the error' }).click()
    await expect(failure).toHaveCount(0)
  })
})

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility of editing, ${theme} theme`, () => {
    // Reduced motion: nothing is half-way through a fade when the page is checked.
    test.use({ colorScheme: theme, reducedMotion: 'reduce' })

    test('the git commands, their dialogs and menus, and the code panel while editing', async ({ page, repo }) => {
      repo.write('README.md', 'changed\n')
      await openHistory(page, repo)
      await page.getByTestId('changes-button').click()
      await expect(page.getByTestId('commit-form')).toBeVisible()
      expect(await violations(page), 'history with changes').toEqual([])
      await page.getByTestId('new-branch').click()
      await expect(dialog(page)).toBeVisible()
      expect(await violations(page), 'new branch dialog').toEqual([])
      await page.keyboard.press('Escape')
      await page.getByTestId('branch-menu').click()
      await expect(page.getByTestId('branch-menu-menu')).toBeVisible()
      expect(await violations(page), 'branch menu').toEqual([])
      await page.keyboard.press('Escape')
      // A failure banner: a push the remote rejects.
      repo.teammateGit('commit', '--allow-empty', '-qm', 'Teammate work')
      repo.teammateGit('push', '-q')
      repo.git('commit', '--allow-empty', '-qm', 'Mine')
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(page.getByTestId('sync')).toContainText('Push origin')
      await page.getByTestId('sync').click()
      await expect(page.getByTestId('git-failure')).toBeVisible()
      expect(await violations(page), 'failure banner').toEqual([])

      // The code panel, editing, with a conflict.
      await page.getByTestId('tab-board').click()
      await page.getByTestId('board-search').fill('BookCard')
      await page.getByTestId('board-search').press('Enter')
      await page.getByTestId('board-read-code').click()
      const code = page.getByTestId('code-viewer')
      await code.locator('.cm-line', { hasText: 'type Props' }).click()
      await page.keyboard.type(' // x')
      repo.write(BOOK_CARD_FILE, 'theirs\n')
      await expect(code.getByTestId('save-conflict')).toBeVisible()
      expect(await violations(page), 'code panel with a conflict').toEqual([])
    })
  })
}
