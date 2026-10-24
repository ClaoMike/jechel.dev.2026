import type { Browser, Page } from '@playwright/test'
import { ADMIN_STATE, VISITOR_STATE } from './states.ts'
import { adminApi, alerts, expect, pushDevice, pushesTo, test, unique, typeInto } from './fixtures.ts'

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
    data: {
      pages: { whatsNew: true, apps: true, youtube: true, about: true, contact: true },
      features: { workWithMe: false },
      maintenance: false,
      maintenanceMessage: '',
    },
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

/** Both ways alerts go back on, and the made-up devices gone. */
async function restoreNotifications() {
  const api = await adminApi()
  for (const channel of ['ntfy', 'push']) expect((await api.put(`/api/notifications/channels/${channel}`, { data: { enabled: true } })).ok()).toBe(true)
  const { devices } = (await (await api.get('/api/notifications/push')).json()) as { devices: { id: number; label: string }[] }
  for (const device of devices.filter((d) => d.label.startsWith('E2E '))) await api.delete(`/api/notifications/push/devices/${device.id}`)
  await api.dispose()
}

test.afterEach(async () => {
  await restoreSite()
  await deleteAddedApps()
  await restoreNotifications()
})

test('the admin adds an app, visitors see it; edits it, they see the change; deletes it, it is gone', async ({ page, browser, browserName }) => {
  const title = unique('Added', { browserName })
  await page.goto('/apps')
  await page.getByRole('button', { name: 'Add an app' }).click()
  const form = page.getByRole('dialog', { name: 'Add an app' })
  await typeInto(form.getByRole('textbox', { name: 'Title' }), title)
  await typeInto(form.getByRole('textbox', { name: 'Description' }), 'Added by the end-to-end tests.')
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
  await typeInto(editing.getByRole('textbox', { name: 'Title' }), `${title} v2`)
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

test('Work with me switched on: the contact form asks what the message is about, and a project arrives as one', async ({ page, browser, browserName }) => {
  const topic = (guest: Page) => guest.getByRole('combobox', { name: "What's it about?" })
  const before = await visitor(browser)
  await before.goto('/contact')
  await expect(before.getByRole('textbox', { name: 'Name' })).toBeVisible()
  await expect(topic(before)).toHaveCount(0)
  await before.context().close()

  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Work with me' }).click()
  await expect(page.getByRole('switch', { name: 'Work with me' })).toBeChecked()

  const name = unique('Client', { browserName })
  const guest = await visitor(browser)
  await guest.goto('/contact')
  await topic(guest).selectOption({ label: 'A project: working with me' })
  await typeInto(guest.getByRole('textbox', { name: 'Name' }), name)
  await typeInto(guest.getByRole('textbox', { name: 'Email' }), 'client@e2e.test')
  await typeInto(guest.getByRole('textbox', { name: 'Message' }), 'We would like a website for our bakery, with online orders and a weekly menu we can change ourselves.')
  await guest.getByRole('button', { name: 'Send message' }).click()
  await expect(guest.getByRole('heading', { name: 'Thank you!' })).toBeVisible()
  await guest.context().close()

  await page.goto('/contact')
  await expect(page.getByRole('row').filter({ hasText: name }).getByText('Project enquiry')).toBeVisible()
})

test("the site's own notifications, with ntfy switched off: a visitor's message reaches the device alone, encrypted for it", async ({ page, browser, browserName }) => {
  const device = pushDevice(unique('phone', { browserName }).replace(/\W+/g, '-'))
  const api = await adminApi()
  expect((await api.post('/api/notifications/push/devices', { data: { ...device.subscription, label: 'E2E phone' } })).ok()).toBe(true)
  await api.dispose()

  await page.goto('/notifications')
  const where = page.getByRole('region', { name: 'Where they go' })
  await expect(where.getByRole('listitem').filter({ hasText: 'E2E phone' })).toBeVisible()
  await where.getByRole('group', { name: 'The ntfy app' }).getByText('Off').click()
  await expect(where.getByRole('group', { name: 'The ntfy app' }).getByRole('radio', { name: 'Off' })).toBeChecked()

  const name = unique('Visitor', { browserName })
  const guest = await visitor(browser)
  await guest.goto('/contact')
  await typeInto(guest.getByRole('textbox', { name: 'Name' }), name)
  await typeInto(guest.getByRole('textbox', { name: 'Email' }), 'visitor@e2e.test')
  await typeInto(guest.getByRole('textbox', { name: 'Message' }), 'Hello! A message to check that the site’s own notifications reach the admin’s phone, encrypted on the way there.')
  await guest.getByRole('button', { name: 'Send message' }).click()
  await expect(guest.getByRole('heading', { name: 'Thank you!' })).toBeVisible()
  await guest.context().close()

  // Signed with the site's key, encrypted for the device: only it can read it.
  const [push] = await pushesTo(device.name)
  expect(push.authorization).toMatch(/^vapid t=[^,]+, k=[\w-]+$/)
  expect(push.encoding).toBe('aes128gcm')
  expect(device.read(push)).toEqual({ title: `New message from ${name}`, body: expect.stringContaining('encrypted'), url: expect.stringMatching(/\/contact$/) })
  expect((await alerts()).some((alert) => alert.title === `New message from ${name}`)).toBe(false)

  // The history says where it went; a test reaches the device too.
  await page.reload()
  const history = page.getByRole('region', { name: 'History' })
  await expect(history.getByRole('listitem').filter({ hasText: `New message from ${name}` })).toContainText("to this site's notifications")
  await where.getByRole('listitem').filter({ hasText: 'E2E phone' }).getByRole('button', { name: 'Send a test' }).click()
  await expect(where.getByText('Sent to E2E phone: it should show in a moment.')).toBeVisible()
  const [, test] = await pushesTo(device.name, 2)
  expect(device.read(test).title).toBe('It works!')
})

test('a device its push service no longer knows is forgotten', async ({ page }) => {
  const api = await adminApi()
  const gone = pushDevice('gone')
  expect((await api.post('/api/notifications/push/devices', { data: { ...gone.subscription, label: 'E2E old phone' } })).ok()).toBe(true)
  await api.dispose()

  await page.goto('/notifications')
  const where = page.getByRole('region', { name: 'Where they go' })
  await where.getByRole('listitem').filter({ hasText: 'E2E old phone' }).getByRole('button', { name: 'Send a test' }).click()
  await expect(where.getByText("It couldn't be sent to E2E old phone.", { exact: false })).toBeVisible()
  await expect(where.getByRole('listitem').filter({ hasText: 'E2E old phone' })).toHaveCount(0)
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
  await typeInto(page.getByRole('textbox', { name: 'Message on the maintenance page (optional)' }), 'Back by 18:00')
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
