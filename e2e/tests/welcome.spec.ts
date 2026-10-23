import { expect, test } from './fixtures.ts'

// A first visit: the welcome popup asks to accept the terms before anything else, and nothing is recorded before.

test.use({ storageState: { cookies: [], origins: [] } })

const welcome = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Welcome to jechel.dev' })

test('asks to accept the terms first, and only lets through once the box is ticked', async ({ page }) => {
  await page.goto('/apps')
  await expect(welcome(page)).toBeVisible()
  const next = welcome(page).getByRole('button', { name: 'Continue' })
  await expect(next).toBeDisabled()
  await expect(welcome(page).getByText('Tick the box to continue.')).toBeVisible()

  // It can't be closed any other way.
  await page.keyboard.press('Escape')
  await expect(welcome(page)).toBeVisible()

  await welcome(page).getByRole('checkbox').check()
  await expect(next).toBeEnabled()
  await next.click()
  await expect(welcome(page)).toBeHidden()
  await expect(page.getByRole('list', { name: 'Apps' })).toBeVisible()
})

test('shows the terms on top, and goes back to the popup', async ({ page }) => {
  await page.goto('/')
  await welcome(page).getByRole('button', { name: 'Terms and Conditions' }).click()
  const terms = page.getByRole('dialog', { name: 'Terms and Conditions' })
  await expect(terms.getByRole('heading', { name: '1. Who runs this website' })).toBeVisible()
  await terms.getByRole('button', { name: 'Close' }).click()
  await expect(terms).toBeHidden()
  await expect(welcome(page)).toBeVisible()
})

test('is not asked again once accepted, also after a reload', async ({ page }) => {
  await page.goto('/')
  await welcome(page).getByRole('checkbox').check()
  await welcome(page).getByRole('button', { name: 'Continue' }).click()
  await expect(welcome(page)).toBeHidden()
  await page.reload()
  await expect(page.getByRole('region', { name: "What's new?" })).toBeVisible()
  await expect(welcome(page)).toBeHidden()
})

test('records nothing of the visit before the terms are accepted, and the visit once they are', async ({ page }) => {
  const recorded: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/analytics/events')) recorded.push(request.url())
  })
  await page.goto('/')
  await expect(welcome(page)).toBeVisible()
  await page.goto('/apps')
  await expect(welcome(page)).toBeVisible()
  await page.waitForTimeout(1500)
  expect(recorded).toEqual([])

  await welcome(page).getByRole('checkbox').check()
  await welcome(page).getByRole('button', { name: 'Continue' }).click()
  // Sent in a batch every few seconds, or when the tab is hidden.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => recorded.length, { timeout: 15_000 }).toBeGreaterThan(0)
})
