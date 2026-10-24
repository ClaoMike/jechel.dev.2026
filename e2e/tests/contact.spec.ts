import { ADMIN_STATE } from './states.ts'
import { alerts, expect, test, unique, typeInto } from './fixtures.ts'

// Contact: a visitor's message, checked as they type, sent to the API, ringing the admin's phone, and in the admin's inbox.

const MESSAGE = 'Hello! I saw your apps and would like to talk about a project: a small web app with a booking calendar and payments.'

test('says what each field is missing, and keeps the message to 100–1000 characters', async ({ page }) => {
  await page.goto('/contact')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Please enter your name.')).toBeVisible()
  await expect(page.getByText('Please enter your email.')).toBeVisible()
  await expect(page.getByText('Please write a message.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')

  await typeInto(page.getByRole('textbox', { name: 'Message' }), 'Too short.')
  await expect(page.getByText('10 / 1000')).toBeVisible()
  await typeInto(page.getByRole('textbox', { name: 'Email' }), 'not an email')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('region', { name: 'Contact me' })).toBeVisible()
})

test("sends a message: thanks the visitor, rings the admin's phone, and lands in the admin's inbox", async ({ page, browser, browserName }) => {
  const name = unique('Visitor', { browserName })
  await page.goto('/contact')
  await typeInto(page.getByRole('textbox', { name: 'Name' }), name)
  await typeInto(page.getByRole('textbox', { name: 'Email' }), 'visitor@e2e.test')
  await typeInto(page.getByRole('textbox', { name: 'Message' }), MESSAGE)
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText("Your message was sent. I'll get back to you at visitor@e2e.test.")
  await expect.poll(async () => (await alerts()).some((alert) => alert.title === `New message from ${name}`)).toBe(true)

  // "Send another message" starts over.
  await page.getByRole('button', { name: 'Send another message' }).click()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('')

  const admin = await browser.newContext({ storageState: ADMIN_STATE })
  const inbox = await admin.newPage()
  await inbox.goto('/contact')
  await expect(inbox.getByText(name).first()).toBeVisible()
  await admin.close()
})
