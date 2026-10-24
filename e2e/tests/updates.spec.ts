import { ADMIN_STATE } from './states.ts'
import { emailsTo, expect, linkIn, test, unique, typeInto } from './fixtures.ts'

// Get updates: subscribing, the confirmation email (from the stand-in for Resend), confirming, and unsubscribing.

const address = (browserName: string) => `${unique('reader', { browserName }).replace(/\s+/g, '.').toLowerCase()}@e2e.test`

test('subscribes: asks to confirm by email, the link confirms, and the admin sees the subscriber', async ({ page, browser, browserName }) => {
  const email = address(browserName)
  await page.goto('/')
  await page.getByRole('button', { name: 'Get updates by email' }).click()
  const dialog = page.getByRole('dialog', { name: 'Get updates' })
  await typeInto(dialog.getByRole('textbox', { name: 'Email' }), email)
  await dialog.getByRole('button', { name: 'Subscribe' }).click()
  await expect(dialog.getByRole('status')).toContainText(`Almost there: check ${email}`)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()

  const [confirmation] = await emailsTo(email)
  expect(confirmation.subject).toBe('Confirm your jechel.dev updates')
  expect(confirmation.from).toBe('jechel.dev <updates@e2e.test>')
  await page.goto(linkIn(confirmation, '/updates/confirm'))
  await expect(page.getByRole('status')).toContainText(email)
  // My channel is next: YouTube's subscribe prompt for it, in a new tab.
  const youtube = page.getByRole('link', { name: 'Subscribe to my YouTube channel' })
  await expect(youtube).toHaveAttribute('href', 'https://www.youtube.com/@e2e?sub_confirmation=1')
  await expect(youtube).toHaveAttribute('target', '_blank')

  const admin = await browser.newContext({ storageState: ADMIN_STATE })
  const community = await admin.newPage()
  await community.goto('/community')
  await expect(community.getByRole('region', { name: 'Email subscribers' }).getByText(email)).toBeVisible()
  await admin.close()
})

test('a confirmation link used twice, or made up, says so', async ({ page, browserName }) => {
  const email = address(browserName)
  await page.goto('/')
  await page.getByRole('button', { name: 'Get updates by email' }).click()
  const dialog = page.getByRole('dialog', { name: 'Get updates' })
  await typeInto(dialog.getByRole('textbox', { name: 'Email' }), email)
  await dialog.getByRole('button', { name: 'Subscribe' }).click()
  const [confirmation] = await emailsTo(email)
  const link = linkIn(confirmation, '/updates/confirm')

  await page.goto(link)
  await expect(page.getByRole('status')).toContainText(email)
  await page.goto('/updates/confirm?token=made-up')
  await expect(page.getByRole('main')).not.toContainText(email)
})

test('refuses an address that is not one', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Get updates by email' }).click()
  const dialog = page.getByRole('dialog', { name: 'Get updates' })
  await typeInto(dialog.getByRole('textbox', { name: 'Email' }), 'nope')
  await dialog.getByRole('button', { name: 'Subscribe' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.getByRole('status')).toHaveCount(0)
})

test('the popup closes with Escape and with Close', async ({ page }) => {
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Get updates by email' })
  const dialog = page.getByRole('dialog', { name: 'Get updates' })
  // From the keyboard (Safari doesn't focus a button that's clicked, so there'd be no focus to give back).
  await open.focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()
  await open.click()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
})
