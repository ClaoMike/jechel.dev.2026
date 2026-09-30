import type { Page } from '@playwright/test'

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
