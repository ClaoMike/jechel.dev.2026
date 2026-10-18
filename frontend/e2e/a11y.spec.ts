import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Accessibility: every page and popup, in every theme, checked by axe against WCAG 2.2 A and AA.
 * The admin's pages fake the signed-in session (as admin.spec.ts does) and the data they show.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const THEMES = ['dark', 'light', 'vice'] as const

async function expectAccessible(page: Page, what: string) {
  // Inside YouTube's player is YouTube's code: the frame itself is still checked (its title), not what's in it.
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).exclude('iframe').analyze()
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => `${n.target.join(' ')}  ${n.html.slice(0, 160)}\n      ${n.failureSummary?.split('\n').slice(1, 2).join(' ')}`).slice(0, 5).join('\n    ')}`)
  expect(summary, `${what}:\n${summary.join('\n')}`).toEqual([])
}

async function useTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
}

/** Waits until nothing on the page is still loading (no placeholders). */
async function settled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
}

const VISITOR_PAGES = ['/', '/apps', '/youtube', '/about', '/contact', '/updates/unsubscribe', '/updates/confirm?token=unknown']

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(({ page }) => useTheme(page, theme))

    for (const path of VISITOR_PAGES) {
      test(`${path} is accessible`, async ({ page }) => {
        await page.goto(path)
        await settled(page)
        await expectAccessible(page, `${path} (${theme})`)
      })
    }

    test('the Get updates and terms popups are accessible', async ({ page }) => {
      await page.goto('/')
      await settled(page)
      await page.getByRole('button', { name: 'Get updates by email' }).click()
      await expect(page.getByRole('dialog', { name: 'Get updates' })).toBeVisible()
      await expectAccessible(page, `Get updates (${theme})`)
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Terms and Conditions' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await settled(page)
      await expectAccessible(page, `terms popup (${theme})`)
    })
  })
}

test.describe('a first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('the welcome popup is accessible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('dialog', { name: 'Welcome to jechel.dev' })).toBeVisible()
    await expectAccessible(page, 'welcome popup')
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the header, with Vice and its hide button, is accessible', async ({ page }) => {
    await useTheme(page, 'vice')
    await page.goto('/about')
    await settled(page)
    await expect(page.getByRole('button', { name: 'Hide page' })).toBeVisible()
    await expectAccessible(page, 'phone, Vice')
  })
})

test.describe('the admin', () => {
  const page1 = <T,>(items: T[]) => ({ items, page: 1, pageSize: 20, totalCount: items.length })

  test.beforeEach(async ({ page }) => {
    await useTheme(page, 'dark')
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } }))
    await page.route('**/api/resume/settings', (route) =>
      route.fulfill({ json: { phone: '+44 7700 900123', email: 'me@example.com', headline: 'Engineer', sections: ['experience', 'skills'], excludedSkills: [], generatedAt: '2026-10-18T12:00:00Z' } }),
    )
    await page.route('**/api/contact/messages?*', (route) =>
      route.fulfill({ json: { items: [{ id: 1, name: 'Ada', receivedAt: '2026-10-18T10:00:00Z', isRead: false }], page: 1, pageSize: 10, totalCount: 1 } }),
    )
    await page.route('**/api/updates/subscribers?*', (route) => route.fulfill({ json: page1([{ id: 1, email: 'ada@example.com', createdAt: '2026-10-01T10:00:00Z', confirmedAt: null }]) }))
    await page.route('**/api/updates/announcements?*', (route) =>
      route.fulfill({ json: page1([{ id: 1, kind: 'app', title: 'Space Game', status: 'pending', createdAt: '2026-10-05T10:00:00Z', sentAt: null, recipientCount: 0 }]) }),
    )
    await page.route('**/api/support/donations?*', (route) =>
      route.fulfill({ json: page1([{ id: 1, type: 'donation.created', fromName: 'Jo', message: 'Thanks', amount: '5', currency: 'GBP', email: null, receivedAt: '2026-10-04T10:00:00Z' }]) }),
    )
    const setting = (key: string, label: string, isSecret: boolean, value = '') => ({ key, label, isSecret, value: isSecret ? null : value, isSet: !!value, hint: null, source: value ? 'settings' : 'none', updatedAt: null })
    await page.route('**/api/settings', (route) =>
      route.fulfill({
        json: {
          settings: [
            setting('Support:Url', 'Page link', false, 'https://buymeacoffee.com/claomike'),
            setting('Support:BuyMeACoffeeWebhookSecret', 'Webhook secret', true),
            setting('YouTube:Channel', 'Channel', false, '@me'),
            setting('YouTube:ApiKey', 'API key', true),
            setting('Email:ResendApiKey', 'API key', true),
            setting('Email:From', 'Sender', false),
            setting('Alerts:NtfyTopic', 'Topic', false),
            setting('Alerts:NtfyServer', 'Server', false),
            setting('Alerts:NtfyToken', 'Access token (optional)', true),
          ],
          google: { isConfigured: true, clientIdHint: '1234…', adminEmailCount: 1, redirectUri: 'https://jechel.dev/api/auth/signin-google' },
          siteUrl: 'https://jechel.dev',
        },
      }),
    )
  })

  test('About Me, with the résumé generator and every editor open, is accessible', async ({ page }) => {
    await page.goto('/about')
    await settled(page)
    await page.getByText('Résumé generator').click()
    // Each Edit button goes once its section is a form: always click the first one left.
    const edits = page.locator('.about-section-actions').getByRole('button', { name: /^Edit / })
    while ((await edits.count()) > 0) await edits.first().click()
    await expectAccessible(page, 'About Me editors')
  })

  for (const path of ['/contact', '/engagement', '/community', '/terms']) {
    test(`${path} is accessible`, async ({ page }) => {
      await page.goto(path)
      await settled(page)
      await expectAccessible(page, `admin ${path}`)
    })
  }

  test('Settings, every card open, is accessible', async ({ page }) => {
    await page.goto('/settings')
    await settled(page)
    const folded = page.locator('.settings-card').getByRole('button', { expanded: false })
    while ((await folded.count()) > 0) await folded.first().click()
    await expectAccessible(page, 'Settings')
  })

  test('the loading and error previews are accessible', async ({ page }) => {
    await page.goto('/about')
    await settled(page)
    const preview = page.getByRole('group', { name: 'Preview the site as' })
    await preview.getByText('Loading', { exact: true }).click()
    await expect(page.getByText('Loading About Me…')).toBeAttached()
    await expectAccessible(page, 'loading preview')
    await preview.getByText('Error', { exact: true }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expectAccessible(page, 'error preview')
  })
})
