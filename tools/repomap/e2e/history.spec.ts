import { expect, test } from '@playwright/test'
import { commitRow, DEMO, watchErrors } from './helpers.ts'

const details = (page: import('@playwright/test').Page) => page.getByTestId('commit-details')
const panelFooter = (page: import('@playwright/test').Page) => page.getByTestId('git-panel').locator('.sidebar-footer')

test.describe('git history tab', () => {
  test('shows the history as a graph with branches, tags and pull requests', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    await page.getByTestId('tab-git').click()
    await expect(page.getByTestId('tab-git')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('commit-list')).toBeVisible()
    await expect(panelFooter(page)).toContainText(`${DEMO.commits}/${DEMO.commits} commits`)
    await expect(page.getByTestId('worktree-row')).toContainText('Uncommitted changes')
    await expect(commitRow(page, DEMO.head).locator('.ref-badge.head')).toContainText('feature/wishlist')
    await expect(commitRow(page, DEMO.wishlistButton).locator('.pr-badge.open')).toContainText('#17')
    await expect(page.locator('.git-graph path').first()).toBeAttached()
    await expect(page.locator('.git-graph circle').first()).toBeAttached()
    expect(page.url()).toContain('tab=git')
    expect(errors).toEqual([])
  })

  test('keeps the tab across reloads, and the map where it was', async ({ page }) => {
    await page.goto('/#tab=git')
    await expect(page.getByTestId('commit-list')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('tab-git')).toHaveAttribute('aria-selected', 'true')
    await page.getByTestId('tab-map').click()
    await expect(page.locator('#panel-map')).toBeVisible()
    await expect(page.locator('#panel-git')).toBeHidden()
    await expect(page.locator('.sidebar-footer').first()).toContainText('253/253 nodes')
    expect(page.url()).not.toContain('tab=git')
    // Arrow keys move between the tabs.
    await page.getByTestId('tab-map').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('tab-git')).toBeFocused()
    await expect(page.getByTestId('tab-git')).toHaveAttribute('aria-selected', 'true')
  })

  test('opens a commit: message, people, pull request, files', async ({ page }) => {
    await page.goto('/#tab=git')
    await commitRow(page, DEMO.merge12).click()
    const panel = details(page)
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Merge pull request #12 from acme/feature/customers')
    await expect(panel.locator('.pr-card')).toContainText('#12 Customers, and orders linked to them')
    await expect(panel.locator('.pr-card')).toContainText('Merged by this commit')
    await expect(panel).toContainText('feature/customers → main')
    await expect(panel.getByTestId('commit-files').locator('li')).toHaveCount(18)
    expect(page.url()).toContain(`commit=${DEMO.merge12}`)
    // Parents are links.
    await panel.locator('.commit-link').filter({ hasText: 'Customer tests' }).click()
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Customer tests')
    await page.keyboard.press('Escape')
    await expect(details(page)).toHaveCount(0)
  })

  test('opens the commit named in the link', async ({ page }) => {
    await page.goto(`/#tab=git&commit=${DEMO.merge12}`)
    await expect(details(page).getByRole('heading', { level: 2 })).toHaveText(/Merge pull request #12/)
    await expect(commitRow(page, DEMO.merge12)).toHaveAttribute('aria-selected', 'true')
  })

  test('walks the commits with the keyboard', async ({ page }) => {
    await page.goto('/#tab=git')
    await expect(page.getByTestId('commit-list')).toBeVisible()
    await page.keyboard.press('h')
    await expect(commitRow(page, DEMO.head)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(details(page).getByRole('heading', { level: 2 })).toHaveText('Bump Playwright')
    await page.keyboard.press('k')
    await expect(commitRow(page, DEMO.head)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(commitRow(page, DEMO.initial)).toBeInViewport()
    await expect(details(page).getByRole('heading', { level: 2 })).toHaveText('Initial commit')
    await page.keyboard.press('Home')
    await expect(page.getByTestId('worktree-row')).toHaveAttribute('aria-selected', 'true')
    await expect(details(page).getByRole('heading', { level: 2 })).toHaveText('Uncommitted changes')
  })

  test('searches and steps through the matches', async ({ page }) => {
    await page.goto('/#tab=git')
    const search = page.getByTestId('git-search')
    await search.fill('order')
    await expect(page.getByTestId('match-count')).toHaveText('–/15')
    await expect(page.locator('.git-row.dimmed').first()).toBeAttached()
    await search.press('Enter')
    await expect(page.getByTestId('match-count')).toHaveText('1/15')
    await search.press('Enter')
    await expect(page.getByTestId('match-count')).toHaveText('2/15')
    await search.press('Shift+Enter')
    await expect(page.getByTestId('match-count')).toHaveText('1/15')
    await search.fill('#12')
    await search.press('Enter')
    await expect(page.getByTestId('match-count')).toHaveText('1/1')
    await expect(commitRow(page, DEMO.merge12)).toHaveAttribute('aria-selected', 'true')
    await search.press('Escape')
    await expect(search).toHaveValue('')
    await expect(page.locator('.git-row.dimmed')).toHaveCount(0)
  })

  test('hides branches, and shows one branch alone', async ({ page }) => {
    await page.goto('/#tab=git')
    await expect(panelFooter(page)).toContainText(`${DEMO.commits}/${DEMO.commits}`)
    await page.getByTestId('ref-branch:feature/wishlist').getByRole('checkbox').click()
    await expect(page.getByText('1 commit is only on hidden branches')).toBeVisible()
    await expect(commitRow(page, DEMO.head)).toHaveCount(0)
    await expect(page.getByTestId('worktree-row')).toHaveCount(0)
    await page.getByTestId('ref-remote:origin/fix/review-pagination').getByRole('button', { name: /^Only / }).click()
    await expect(commitRow(page, DEMO.wishlistButton)).toHaveCount(0)
    await expect(page.locator('.git-row')).not.toHaveCount(0)
    await page.getByTestId('git-panel').getByRole('button', { name: 'Reset' }).click()
    await expect(panelFooter(page)).toContainText(`${DEMO.commits}/${DEMO.commits}`)
    // Tags and remotes switch off as groups.
    const tags = page.getByRole('checkbox', { name: 'Show tags' })
    await page.getByTitle('Show tags').click()
    await expect(tags).not.toBeChecked()
    await expect(page.locator('.git-row .ref-badge.tag')).toHaveCount(0)
    await page.getByTitle('Show tags').click()
    await expect(tags).toBeChecked()
    await expect(page.locator('.git-row .ref-badge.tag').first()).toBeVisible()
  })

  test('lists pull requests and jumps to their commits', async ({ page }) => {
    await page.goto('/#tab=git')
    const panel = page.getByTestId('git-panel')
    await panel.getByRole('button', { name: 'Open 2' }).click()
    await expect(panel.locator('.pr-list li')).toHaveCount(2)
    await panel.getByRole('button', { name: 'All 18' }).click()
    await panel.getByTestId('pr-12').click()
    await expect(commitRow(page, DEMO.merge12)).toHaveAttribute('aria-selected', 'true')
    await expect(panel.getByTestId('pr-16')).toBeDisabled() // closed, never merged, no link in the demo
  })

  test('follows a file between the map and its history', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('search').fill('BookCard')
    await page.getByTestId('search').press('Enter')
    await expect(page.getByTestId('details').getByRole('heading', { name: 'BookCard' })).toBeVisible()
    await page.getByTestId('file-history').click()
    await expect(page.getByTestId('tab-git')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('path-filter')).toContainText('History of web/src/features/books/BookCard.tsx: 3 commits')
    await expect(commitRow(page, DEMO.wishlistButton)).toHaveAttribute('aria-selected', 'true')
    await details(page).getByRole('button', { name: 'Show web/src/features/books/BookCard.tsx in the map' }).click()
    await expect(page.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('details').getByRole('heading', { name: 'BookCard' })).toBeVisible()
    await page.getByTestId('tab-git').click()
    await page.getByTestId('path-filter').getByRole('button', { name: 'Stop following this file' }).click()
    await expect(page.getByTestId('path-filter')).toHaveCount(0)
  })

  test('shows its own help', async ({ page }) => {
    await page.goto('/#tab=git')
    await expect(page.getByTestId('commit-list')).toBeVisible()
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Help' })).toContainText('How to read the history')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Help' })).toHaveCount(0)
  })

  test('opens a git.json from disk, and refuses other files', async ({ page }) => {
    await page.goto('/#tab=git')
    await expect(page.getByTestId('commit-list')).toBeVisible()
    const history = {
      kind: 'repomap-git',
      version: 1,
      generatedAt: '2026-01-01T00:00:00Z',
      repo: { name: 'tiny', remotes: [], head: { branch: 'main', commit: 'b'.repeat(40) } },
      commits: [
        { hash: 'b'.repeat(40), parents: ['a'.repeat(40)], author: 'Ada', date: 1_767_225_600, subject: 'Second' },
        { hash: 'a'.repeat(40), parents: [], author: 'Ada', date: 1_767_222_000, subject: 'First' },
      ],
      refs: [{ name: 'main', type: 'branch', commit: 'b'.repeat(40) }],
      pullRequests: [],
    }
    await page.getByTestId('open-file').setInputFiles({ name: 'tiny.git.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(history)) })
    await expect(page.locator('.toast')).toContainText('Loaded tiny.git.json')
    await expect(panelFooter(page)).toContainText('2/2 commits')
    await page.getByTestId('open-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"repomap-git"}') })
    await expect(page.locator('.toast')).toContainText('Could not open bad.json')
    await expect(panelFooter(page)).toContainText('2/2 commits')
  })
})
