import { expect, test, type Page } from '@playwright/test'

const MESSAGE = 'Hello Claudiu! This message was sent by the end-to-end tests, through the real API and database. '.repeat(2)

test('a visitor sends a message through the contact form', async ({ page }) => {
  await page.goto('/contact')

  await page.getByLabel('Name').fill(`E2E visitor ${Date.now()}`)
  await page.getByLabel('Email').fill('visitor@example.com')
  await page.getByLabel('Message').fill(MESSAGE)
  await expect(page.getByText(`${MESSAGE.trim().length} / 1000`)).toBeVisible()
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByRole('status')).toContainText('Your message was sent')
})

test('the contact form explains what is wrong before sending', async ({ page }) => {
  let posted = false
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/contact')) posted = true
  })
  await page.goto('/contact')

  await page.getByLabel('Email').fill('not-an-email')
  await page.getByLabel('Message').fill('Too short.')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Please enter your name.')).toBeVisible()
  await expect(page.getByText(/valid email address/)).toBeVisible()
  await expect(page.getByText(/at least 100 characters/)).toBeVisible()
  await expect(page.getByLabel('Name')).toBeFocused()
  expect(posted).toBe(false)
})

test('the API rejects an invalid message and keeps the inbox private', async ({ request }) => {
  const invalid = await request.post('/api/contact', { data: { name: 'x', email: 'x@example.com', message: 'short' } })
  expect(invalid.status()).toBe(400)
  expect((await invalid.json()).errors).toHaveProperty('message')

  expect((await request.get('/api/contact/messages')).status()).toBe(401)
})

// The real Google sign-in can't run in automated tests, so the admin's session and inbox are faked.
async function signInAsAdminWithInbox(page: Page, count: number) {
  const messages = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Sender ${i + 1}`,
    email: `sender${i + 1}@example.com`,
    message: `${MESSAGE}(#${i + 1})`,
    receivedAt: new Date(Date.UTC(2026, 9, 8, 12) - i * 3_600_000).toISOString(),
    readAt: null as string | null,
  }))
  const marked: number[] = []

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } }),
  )
  await page.route(/\/api\/contact\/messages(\?.*)?$/, (route) => {
    const url = new URL(route.request().url())
    const pageNumber = Number(url.searchParams.get('page'))
    const pageSize = Number(url.searchParams.get('pageSize'))
    const items = messages
      .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      .map((m) => ({ id: m.id, name: m.name, receivedAt: m.receivedAt, isRead: m.readAt !== null }))
    return route.fulfill({ json: { items, page: pageNumber, pageSize, totalCount: messages.length } })
  })
  await page.route(/\/api\/contact\/messages\/\d+$/, (route) => {
    const id = Number(route.request().url().split('/').pop())
    return route.fulfill({ json: messages.find((m) => m.id === id) })
  })
  await page.route(/\/api\/contact\/messages\/\d+\/read$/, (route) => {
    const id = Number(route.request().url().split('/').at(-2))
    marked.push(id)
    messages.find((m) => m.id === id)!.readAt = new Date().toISOString()
    return route.fulfill({ status: 204 })
  })

  return { messages, marked }
}

test('the admin sees the inbox instead of the form, and pages through it', async ({ page }) => {
  await signInAsAdminWithInbox(page, 15)
  await page.goto('/contact')

  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
  await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(11) // header + 10
  await expect(page.getByText('Page 1 of 2')).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page).toHaveURL('/contact?page=2')
  await expect(page.getByRole('button', { name: 'Sender 15' })).toBeVisible()
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(6)
})

test('opening a message shows it in a popup, marks it as read, and copies fields', async ({ page, context, browserName }) => {
  const { messages, marked } = await signInAsAdminWithInbox(page, 2)
  await page.goto('/contact')
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Sender 1' }) })
  await expect(row.getByText('Unread')).toHaveCount(1)

  await page.getByRole('button', { name: 'Sender 1' }).click()

  const dialog = page.getByRole('dialog', { name: 'Message from Sender 1' })
  await expect(dialog.getByRole('link', { name: 'sender1@example.com' })).toHaveAttribute('href', 'mailto:sender1@example.com')
  await expect(dialog.getByText(messages[0].message.trim())).toBeVisible()
  await expect(row.getByText('Unread')).toHaveCount(0)
  expect(marked).toEqual([1])

  // Clipboard reads need a permission only Chromium lets Playwright grant.
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await dialog.getByRole('button', { name: 'Copy email' }).click()
    await expect(dialog.getByText('email copied')).toBeAttached()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('sender1@example.com')
  } else {
    for (const field of ['name', 'email', 'received', 'message']) {
      await expect(dialog.getByRole('button', { name: `Copy ${field}` })).toBeVisible()
    }
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('the message popup is keyboard friendly', async ({ page }) => {
  await signInAsAdminWithInbox(page, 1)
  await page.goto('/contact')

  // Opened from the keyboard (WebKit doesn't focus buttons on click, so there'd be nothing to return to).
  await page.getByRole('button', { name: 'Sender 1' }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Message from Sender 1' })
  await expect(dialog.getByRole('button', { name: 'Copy message' })).toBeVisible()

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sender 1' })).toBeFocused()
})
