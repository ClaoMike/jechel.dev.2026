import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { startServer, VIEWER_DIST } from '../src/core/serve.ts'
import type { RepoGraph } from '../src/shared/types.ts'
import { BOOK_CARD, nodePosition, serveSource, watchErrors } from './helpers.ts'

const DEMO_GRAPH = join(import.meta.dirname, '..', 'viewer', 'public', 'samples', 'demo.graph.json')
const footer = (page: import('@playwright/test').Page) => page.getByTestId('sidebar').locator('.sidebar-footer')

test.describe('architecture map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(footer(page)).toContainText('253/253 nodes')
  })

  test('right-clicking a node offers its code, shown like an editor', async ({ page }) => {
    const errors = watchErrors(page)
    await serveSource(page)
    const at = await nodePosition(page, BOOK_CARD)
    await page.mouse.click(at.x, at.y, { button: 'right' })
    const menu = page.getByTestId('context-menu')
    await expect(menu).toContainText('BookCard')
    await expect(menu.getByRole('menuitem')).toContainText('View code')
    await expect(menu.getByRole('menuitem')).toContainText('BookCard.tsx:5')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    await page.mouse.click(at.x, at.y, { button: 'right' })
    await page.getByRole('menuitem').click()
    const code = page.getByTestId('code-viewer')
    await expect(code).toBeVisible()
    await expect(code).toHaveAttribute('aria-label', 'Code of BookCard')
    await expect(code.locator('.cm-content')).toContainText('export function BookCard')
    await expect(code.locator('.cm-target-start')).toContainText('export function BookCard')
    await expect(code.locator('.code-status')).toContainText('TypeScript JSX')
    await expect(code.locator('.code-status')).toContainText('8 lines')
    // Syntax colouring: keywords and strings get their own spans.
    await expect(code.locator('.cm-content span').filter({ hasText: /^export$/ }).first()).toBeVisible()
    const wrap = code.getByRole('button', { name: 'Word wrap' })
    const pressed = await wrap.getAttribute('aria-pressed')
    await wrap.click()
    await expect(wrap).not.toHaveAttribute('aria-pressed', pressed ?? '')
    await page.keyboard.press('Escape')
    await expect(code).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('the code panel says so when the source is not available', async ({ page }) => {
    await page.getByTestId('search').fill('BookCard')
    await page.getByTestId('search').press('Enter')
    await page.getByTestId('view-code').click()
    const code = page.getByTestId('code-viewer')
    await expect(code.getByRole('alert')).toContainText('does not exist in this checkout')
    await code.getByRole('button', { name: 'Close code' }).click()
    await expect(code).toHaveCount(0)
  })

  test('theme, colours and labels are remembered', async ({ page }) => {
    const theme = await page.evaluate(() => document.documentElement.dataset.theme)
    await page.getByRole('button', { name: 'Toggle theme' }).click()
    const flipped = theme === 'dark' ? 'light' : 'dark'
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped)
    await page.getByRole('combobox', { name: 'Color by' }).selectOption('layer')
    await page.getByRole('combobox', { name: 'Labels' }).selectOption('all')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped)
    await expect(page.getByRole('combobox', { name: 'Color by' })).toHaveValue('layer')
    await expect(page.getByRole('combobox', { name: 'Labels' })).toHaveValue('all')
  })

  test('keyboard shortcuts drive the view', async ({ page }) => {
    const errors = watchErrors(page)
    await page.locator('.scene').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('[')
    await expect(page.getByTestId('sidebar')).not.toHaveClass(/open/)
    await page.keyboard.press('[')
    await expect(page.getByTestId('sidebar')).toHaveClass(/open/)
    await page.keyboard.press('c')
    await expect(page.getByRole('combobox', { name: 'Color by' })).toHaveValue('layer')
    await page.keyboard.press('l')
    await expect(page.getByRole('combobox', { name: 'Labels' })).toHaveValue('all')
    for (const key of ['f', 's', '1', '2', 'r']) await page.keyboard.press(key)
    await page.keyboard.press('/')
    await expect(page.getByTestId('search')).toBeFocused()
    expect(errors).toEqual([])
  })

  test('layers hide and come back without anything moving', async ({ page }) => {
    const before = await nodePosition(page, BOOK_CARD)
    const backend = page.getByTestId('layer-backend')
    await backend.getByRole('checkbox').click()
    await expect(backend).toHaveClass(/hide/)
    await expect(footer(page)).not.toContainText('253/253 nodes')
    await backend.getByRole('checkbox').click()
    await expect(footer(page)).toContainText('253/253 nodes')
    const after = await nodePosition(page, BOOK_CARD)
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThan(1)
  })

  test('the trace list selects other nodes', async ({ page }) => {
    await page.getByTestId('search').fill('BooksPage')
    await page.getByTestId('search').press('Enter')
    const details = page.getByTestId('details')
    await details.locator('.node-link').filter({ hasText: 'BookCard' }).first().click()
    await expect(details.getByRole('heading', { name: 'BookCard' })).toBeVisible()
  })

  test('opens a graph.json from disk or dropped on the page, and refuses others', async ({ page }) => {
    const graph = JSON.parse(readFileSync(DEMO_GRAPH, 'utf8')) as RepoGraph
    graph.meta.repo.name = 'renamed demo'
    await page.getByTestId('open-file').setInputFiles({ name: 'mine.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
    await expect(page.locator('.toast')).toContainText('Loaded mine.graph.json')
    await expect(page.locator('.repo strong')).toHaveText('renamed demo')
    await page.getByTestId('open-file').setInputFiles({ name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') })
    await expect(page.locator('.toast')).toContainText('Could not open nope.json')

    graph.meta.repo.name = 'dropped demo'
    const transfer = await page.evaluateHandle((text) => {
      const data = new DataTransfer()
      data.items.add(new File([text], 'dropped.graph.json', { type: 'application/json' }))
      return data
    }, JSON.stringify(graph))
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer })
    await expect(page.locator('.dropzone')).toBeVisible()
    await page.dispatchEvent('body', 'drop', { dataTransfer: transfer })
    await expect(page.locator('.dropzone')).toHaveCount(0)
    await expect(page.locator('.repo strong')).toHaveText('dropped demo')
  })
})

test('loads a graph named in the URL, and explains when it cannot', async ({ page }) => {
  await page.goto('/?graph=samples/demo.graph.json')
  await expect(page.locator('.repo strong')).toHaveText('bookshelf (demo)')
  await page.goto('/?graph=missing.graph.json')
  await expect(page.getByRole('alert')).toContainText('Could not load the graph')
})

test('reloads live when the graph is rebuilt', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'repomap-live-'))
  const graphPath = join(dir, 'graph.json')
  copyFileSync(DEMO_GRAPH, graphPath)
  const server = await startServer({ graphPath, repoRoot: dir, port: 0, host: '127.0.0.1', distDir: VIEWER_DIST, watching: true })
  try {
    await page.goto(server.url)
    await expect(footer(page)).toContainText('253/253 nodes')
    const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as RepoGraph
    graph.nodes.push({ id: 'frontend:symbol:web/src/New.tsx#New', label: 'New', kind: 'component', layer: 'frontend', role: 'production', pos: [0, 135, 0] })
    writeFileSync(graphPath, JSON.stringify(graph))
    // Give the page's event stream a moment to connect before announcing the rebuild.
    await expect.poll(async () => {
      server.broadcast('graph', { at: Date.now() })
      return footer(page).textContent()
    }).toContain('254/254 nodes')
    await expect(page.locator('.toast')).toContainText('Graph updated')
  } finally {
    await server.close()
  }
})
