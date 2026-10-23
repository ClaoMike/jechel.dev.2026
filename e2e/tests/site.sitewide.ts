import type { Browser, Page } from '@playwright/test'
import { ADMIN_STATE, VISITOR_STATE } from './states.ts'
import { adminApi, expect, test, unique } from './fixtures.ts'

// What the admin changes for everyone: apps added, edited and deleted; pages switched off; maintenance. These run once
// every browser's other tests are done, one browser at a time (playwright.config.ts), and put everything back.

test.describe.configure({ mode: 'serial' })
test.use({ storageState: ADMIN_STATE })

async function visitor(browser: Browser): Promise<Page> {
  return (await browser.newContext({ storageState: VISITOR_STATE })).newPage()
}

/** What visitors may see, as it was, back however the test ended. */
async function restoreSite() {
  const api = await adminApi()
  const response = await api.put('/api/site', {
    data: { pages: { whatsNew: true, apps: true, youtube: true, about: true, contact: true }, maintenance: false, maintenanceMessage: '' },
  })
  expect(response.ok(), await response.text()).toBe(true)
  await api.dispose()
}
/** Deletes the apps a test added, however it ended, so the other tests see only the setup's. */
async function deleteAddedApps(prefix = 'Added ') {
  const api = await adminApi()
  const { items } = (await (await api.get('/api/apps?page=1&pageSize=50')).json()) as { items: { id: number; title: string }[] }
  for (const app of items.filter((a) => a.title.startsWith(prefix))) await api.delete(`/api/apps/${app.id}`)
  await api.dispose()
}

test.afterEach(async () => {
  await restoreSite()
  await deleteAddedApps()
})

test('the admin adds an app, visitors see it; edits it, they see the change; deletes it, it is gone', async ({ page, browser, browserName }) => {
  const title = unique('Added', { browserName })
  await page.goto('/apps')
  await page.getByRole('button', { name: 'Add an app' }).click()
  const form = page.getByRole('dialog', { name: 'Add an app' })
  await form.getByRole('textbox', { name: 'Title' }).fill(title)
  await form.getByRole('textbox', { name: 'Description' }).fill('Added by the end-to-end tests.')
  await form.getByRole('button', { name: 'Add app' }).click()
  // Added, the popup shows the app as visitors will.
  await expect(page.getByRole('dialog', { name: title })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('list', { name: 'Apps' }).getByRole('button', { name: title })).toBeVisible()

  const guest = await visitor(browser)
  await guest.goto('/apps')
  await expect(guest.getByRole('button', { name: title })).toBeVisible()

  // Edit: a new title.
  await page.getByRole('list', { name: 'Apps' }).getByRole('button', { name: title }).click()
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Edit' }).click()
  const editing = page.getByRole('dialog', { name: `Edit ${title}` })
  await editing.getByRole('textbox', { name: 'Title' }).fill(`${title} v2`)
  await editing.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog', { name: `${title} v2` })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: `${title} v2` })).toBeHidden()
  await guest.reload()
  await expect(guest.getByRole('button', { name: `${title} v2` })).toBeVisible()

  // Delete, after confirming.
  await page
    .getByRole('list', { name: 'Apps' })
    .getByRole('button', { name: `${title} v2` })
    .click()
  await page
    .getByRole('dialog', { name: `${title} v2` })
    .getByRole('button', { name: 'Edit' })
    .click()
  await page.getByRole('button', { name: 'Delete app' }).click()
  await page
    .getByRole('dialog', { name: /Delete/ })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('button', { name: `${title} v2` })).toHaveCount(0)
  await guest.reload()
  await expect(guest.getByRole('list', { name: 'Apps' })).toBeVisible()
  await expect(guest.getByRole('button', { name: `${title} v2` })).toHaveCount(0)
  await guest.context().close()
})

test("a page switched off in Settings goes from the visitors' tabs and address bar, and comes back", async ({ page, browser }) => {
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'YouTube' }).click()
  await expect(page.getByRole('switch', { name: 'YouTube' })).not.toBeChecked()

  const guest = await visitor(browser)
  await guest.goto('/youtube')
  await expect(guest).toHaveURL('/')
  await expect(guest.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'YouTube' })).toHaveCount(0)

  await page.getByRole('switch', { name: 'YouTube' }).click()
  await expect(page.getByRole('switch', { name: 'YouTube' })).toBeChecked()
  await guest.context().close()
  // A visitor already here sees it within 30 seconds (/api/site is cached that long); a new one at once.
  const next = await visitor(browser)
  await next.goto('/youtube')
  await expect(next.getByRole('list', { name: 'Videos' })).toBeVisible()
  await next.context().close()
})

test('every page switched off: visitors get "Coming soon"', async ({ browser }) => {
  const api = await adminApi()
  await api.put('/api/site', { data: { pages: { whatsNew: false, apps: false, youtube: false, about: false, contact: false } } })
  await api.dispose()
  const guest = await visitor(browser)
  await guest.goto('/')
  await expect(guest.getByRole('heading', { name: 'Coming soon' })).toBeVisible()
  await guest.context().close()
})

test('maintenance: visitors get the maintenance page with its message; the admin still sees the site, warned', async ({ page, browser }) => {
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Under maintenance' }).click()
  await page.getByRole('textbox', { name: 'Message on the maintenance page (optional)' }).fill('Back by 18:00')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('switch', { name: 'Under maintenance' })).toBeChecked()

  const guest = await visitor(browser)
  await guest.goto('/apps')
  await expect(guest.getByRole('region', { name: /maintenance/i }).or(guest.locator('.maintenance'))).toBeVisible()
  await expect(guest.getByText('Back by 18:00')).toBeVisible()
  await expect(guest.getByRole('list', { name: 'Apps' })).toHaveCount(0)

  await page.goto('/apps')
  await expect(page.getByRole('link', { name: /Maintenance on/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Apps' })).toBeVisible()
  await guest.context().close()
})
