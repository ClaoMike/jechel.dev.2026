import { expect, test as setup } from '@playwright/test'
import { APPS } from '../data.ts'
import { adminApi } from './fixtures.ts'
import { ADMIN_STATE, VISITOR_STATE } from './states.ts'

// Run once, before every browser's tests: a visitor who accepted the terms, the admin signed in on top, and the
// content the tests look at (the YouTube videos come from the stand-in, see data.ts).
setup.describe.configure({ mode: 'serial' })

setup('a visitor accepts the terms', async ({ page }) => {
  await page.goto('/')
  const welcome = page.getByRole('dialog', { name: 'Welcome to jechel.dev' })
  await welcome.getByRole('checkbox').check()
  await welcome.getByRole('button', { name: 'Continue' }).click()
  await expect(welcome).toBeHidden()
  await page.context().storageState({ path: VISITOR_STATE })
})

setup('the admin signs in with Google', async ({ browser }) => {
  const context = await browser.newContext({ storageState: VISITOR_STATE })
  const page = await context.newPage()
  await page.goto('/admin')
  await page.getByRole('link', { name: 'Sign in with Google' }).click()
  await page.getByRole('link', { name: /admin@e2e\.test/ }).click()
  await expect(page.getByText('Signed in as admin@e2e.test')).toBeVisible()
  await context.storageState({ path: ADMIN_STATE })
  await context.close()
})

setup('the content', async () => {
  const api = await adminApi()
  const existing = (await (await api.get('/api/apps?page=1&pageSize=50')).json()).items as { title: string }[]
  for (const title of APPS.filter((t) => !existing.some((app) => app.title === t))) {
    const response = await api.post('/api/apps', {
      data: {
        title,
        description: `${title} does one thing well.`,
        categoryIds: [],
        platforms: ['Web', 'Android'],
        links: [{ label: 'Website', url: 'https://example.com/' }],
        media: [],
        showInWhatsNew: true,
      },
    })
    expect(response.status(), await response.text()).toBe(201)
  }
  await api.dispose()
})
