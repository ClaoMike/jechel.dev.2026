import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { ADMIN_STATE } from './states.ts'
import { expect, test, viceMotion } from './fixtures.ts'

// Accessibility, checked by axe (WCAG 2.1 A and AA) on every page, in every theme, in every browser. What's inside
// YouTube's player is YouTube's, so it's left out.

const THEMES = ['dark', 'light', 'vice'] as const
const VISITOR_PAGES = ['/', '/apps', '/youtube', '/about', '/contact', '/terms']
const ADMIN_PAGES = ['/apps', '/contact', '/engagement', '/community', '/notifications', '/terms', '/settings', '/features']

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('iframe').analyze()
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

async function open(page: Page, path: string, theme: string) {
  await page.addInitScript((value) => localStorage.setItem('theme', value), theme)
  await page.goto(path)
  await expect(page.locator('main')).not.toBeEmpty()
  // Loaded: no placeholders left.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    if (theme === 'vice') test.use(viceMotion)
    for (const path of VISITOR_PAGES) {
      test(`${path} has no WCAG problems`, async ({ page }) => {
        await open(page, path, theme)
        expect(await violations(page)).toEqual([])
      })
    }

    test('the popups have no WCAG problems: an app, Get updates, the terms', async ({ page }) => {
      await open(page, '/apps', theme)
      await page.getByRole('button', { name: 'E2E app 5', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await violations(page)).toEqual([])
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Get updates by email' }).click()
      await expect(page.getByRole('dialog', { name: 'Get updates' })).toBeVisible()
      expect(await violations(page)).toEqual([])
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Terms and Conditions' }).click()
      await expect(page.getByRole('dialog', { name: 'Terms and Conditions' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })
  })
}

test.describe('first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('the welcome popup has no WCAG problems', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('dialog', { name: 'Welcome to jechel.dev' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })
})

test.describe("the admin's pages", () => {
  test.use({ storageState: ADMIN_STATE })
  for (const path of ADMIN_PAGES) {
    test(`${path} has no WCAG problems`, async ({ page }) => {
      await open(page, path, 'dark')
      expect(await violations(page)).toEqual([])
    })
  }
})
