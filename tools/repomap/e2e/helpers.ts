import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Collects uncaught errors and console errors, to assert a page stayed clean. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

/** A commit row of the history list by (a prefix of) its hash. */
export const commitRow = (page: Page, hash: string) => page.locator(`[data-hash^="${hash}"]`)

/** Commits of the demo history (samples/synthetic-git.ts; its hashes are deterministic). */
export const DEMO = {
  head: 'f6d1608', // "Wishlist page", HEAD of feature/wishlist
  wishlistButton: '453b36f', // head of the open pull request #17
  merge12: 'df7e702', // "Merge pull request #12 from acme/feature/customers"
  initial: 'b90af6d',
  commits: 63,
}

/** A node of the demo graph that is easy to reach in the default view. */
export const BOOK_CARD = 'frontend:symbol:web/src/features/books/BookCard.tsx#BookCard'

export const BOOK_CARD_SOURCE = [
  "import { Link } from 'react-router'",
  '',
  'type Props = { title: string }',
  '',
  'export function BookCard({ title }: Props) {',
  '  return <article className="book-card">{title}</article>',
  '}',
  '',
].join('\n')

/** Where a node is drawn, once the camera has settled (the scene exposes this under Playwright only). */
export async function nodePosition(page: Page, id: string): Promise<{ x: number; y: number }> {
  let last: { x: number; y: number } | null = null
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await page.evaluate((nodeId) => (window as unknown as { __repomapTest?: { screenPosition(id: string): { x: number; y: number } | null } }).__repomapTest?.screenPosition(nodeId) ?? null, id)
    if (now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) return now
    last = now
    await page.waitForTimeout(150)
  }
  throw new Error(`node ${id} never settled on screen`)
}

/** Answers the code panel's source requests with fixed text. */
export async function serveSource(page: Page, text = BOOK_CARD_SOURCE): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith('/source'),
    (route) => route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: text }),
  )
}

/** The page is never wider than the screen (no sideways scrolling). */
export async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1)
}

/** WCAG 2.1 A/AA problems on the page as it is now, one line each (empty when there are none). */
export async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${v.help} — ${n.target.join(' ')}${n.failureSummary ? ` (${n.failureSummary.split('\n').slice(1).join(' ').trim()})` : ''}`),
  )
}

/** The map has loaded (the top bar shows the repository): searching before that finds nothing. */
export async function mapLoaded(page: Page): Promise<void> {
  await expect(page.locator('.topbar .repo')).toBeVisible({ timeout: 20_000 })
}
