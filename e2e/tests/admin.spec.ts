import type { Browser, Page } from '@playwright/test'
import { ADMIN_STATE, VISITOR_STATE } from './states.ts'
import { alerts, expect, test, typeInto } from './fixtures.ts'

// The admin: signing in with Google (the stand-in), who is let in, signing out, and the admin's own pages.

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Sections' })
const ADMIN_TABS = ['Engagement', 'Community', 'Notifications', 'Terms', 'Settings', 'Feature Testing BETA']

/** A browser of its own (a visitor who accepted the terms), so signing in or out here leaves the shared admin alone. */
async function freshPage(browser: Browser) {
  const context = await browser.newContext({ storageState: VISITOR_STATE })
  return context.newPage()
}

async function chooseAt(page: Page, account: RegExp | string) {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible()
  await page.getByRole('link', { name: 'Sign in with Google' }).click()
  await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible()
  await page.getByRole('link', { name: account }).click()
}

test.describe('signing in', () => {
  test("lets the admin in with Google: home, the admin's tabs, and an alert on the phone", async ({ browser }) => {
    const page = await freshPage(browser)
    const before = (await alerts()).filter((a) => a.title === 'Signed in to jechel.dev').length
    await chooseAt(page, /admin@e2e\.test/)
    await expect(page).toHaveURL('/')
    await expect(page.getByText('Signed in as admin@e2e.test')).toBeVisible()
    for (const name of ADMIN_TABS) await expect(tabs(page).getByRole('link', { name })).toBeVisible()
    await expect.poll(async () => (await alerts()).filter((a) => a.title === 'Signed in to jechel.dev').length).toBeGreaterThan(before)
    await page.context().close()
  })

  test('refuses an account that is not the admin, and says why', async ({ browser }) => {
    const page = await freshPage(browser)
    await chooseAt(page, /stranger@e2e\.test/)
    await expect(page).toHaveURL(/\/admin\?error=not_authorized/)
    await expect(page.getByRole('alert')).toContainText('not allowed')
    await page.goto('/settings')
    await expect(page).toHaveURL('/')
    await expect.poll(async () => (await alerts()).some((a) => a.title === 'Sign-in refused' && String(a.message).includes('stranger@e2e.test'))).toBe(true)
    await page.context().close()
  })

  test('says so when the sign-in is cancelled at Google', async ({ browser }) => {
    const page = await freshPage(browser)
    await chooseAt(page, 'Cancel')
    await expect(page).toHaveURL(/\/admin\?error=/)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible()
    await page.context().close()
  })

  test('signs out: the site is back to what visitors see', async ({ browser }) => {
    const page = await freshPage(browser)
    await chooseAt(page, /admin@e2e\.test/)
    await expect(page.getByText('Signed in as admin@e2e.test')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByText(/Signed in as/)).toBeHidden()
    await expect(tabs(page).getByRole('link', { name: 'Settings' })).toHaveCount(0)
    await page.goto('/settings')
    await expect(page).toHaveURL('/')
    await page.context().close()
  })

  test('a device signed out from Settings is signed out for good', async ({ browser }, testInfo) => {
    // The other device looks like Opera (which no project runs), on a system of its own for each project (they run at
    // once), so its row is told apart.
    const system = (
      {
        chrome: ['X11; Linux x86_64', 'Linux'],
        edge: ['Linux; Android 14', 'Android'],
        firefox: ['X11; CrOS x86_64 14541.0.0', 'ChromeOS'],
        safari: ['iPhone; CPU iPhone OS 18_0 like Mac OS X', 'iOS'],
      } as Record<string, [string, string]>
    )[testInfo.project.name] ?? ['X11; Linux x86_64', 'Linux']
    const otherContext = await browser.newContext({
      storageState: VISITOR_STATE,
      userAgent: `Mozilla/5.0 (${system[0]}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/120.0.0.0`,
    })
    const other = await otherContext.newPage()
    await chooseAt(other, /admin@e2e\.test/)
    await expect(other.getByText('Signed in as admin@e2e.test')).toBeVisible()

    const here = await freshPage(browser)
    await chooseAt(here, /admin@e2e\.test/)
    await here.goto('/settings')
    const devices = here.getByRole('list', { name: 'Signed-in devices' })
    await expect(devices.getByText('This device')).toBeVisible()
    const row = devices.getByRole('listitem').filter({ hasText: `Opera on ${system[1]}` })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: /^Sign out/ }).click()
    const confirm = here.getByRole('dialog')
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /Sign out/ }).click()
    await expect(row).toHaveCount(0)

    await other.reload()
    await expect(other.getByText(/Signed in as/)).toBeHidden()
    await expect(other.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Settings' })).toHaveCount(0)
    await here.context().close()
    await otherContext.close()
  })
})

test.describe("the admin's pages", () => {
  test.use({ storageState: ADMIN_STATE })

  test('/admin, signed in, goes home', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL('/')
  })

  test('Engagement counts the visits, by the period picked', async ({ page }) => {
    await page.goto('/engagement')
    await expect(page.getByRole('heading', { name: 'Engagement', level: 2 })).toBeVisible()
    const period = page.getByRole('group', { name: 'Period' })
    await expect(period.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('term').filter({ hasText: 'Visits' })).toBeVisible()
    await period.getByRole('button', { name: '7 days' }).click()
    await expect(period.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('region', { name: /per day/ })).toBeVisible()
  })

  test('Community previews the update emails', async ({ page }) => {
    await page.goto('/community')
    const preview = page.getByRole('region', { name: 'Preview update emails' })
    await expect(preview.getByRole('definition').filter({ hasText: 'Confirm your jechel.dev updates' })).toBeVisible()
    await preview.getByRole('button', { name: 'New video', exact: true }).click()
    await expect(preview.getByRole('button', { name: 'New video', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await preview.getByRole('button', { name: 'Edit' }).click()
    await expect(preview.getByRole('button', { name: 'Save' })).toBeDisabled()
    await preview.getByRole('button', { name: 'Cancel' }).click()
    await expect(preview.getByRole('button', { name: 'Edit' })).toBeVisible()
  })

  test('Notifications lists the kinds of phone alert, each on or off', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.getByRole('region', { name: 'On your phone' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'New message' }).getByRole('radio', { name: 'On' })).toBeVisible()
  })

  test('Feature Testing (BETA) is the last tab, and opens the first feature to test: Work with me', async ({ page }) => {
    await page.goto('/features')
    const tab = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Feature Testing BETA' })
    await expect(tab).toHaveAttribute('aria-current', 'page')
    await expect(tab).toBeInViewport()
    await expect(page).toHaveURL('/features/work-with-me')
    await expect(page.getByRole('navigation', { name: 'Features' }).getByRole('link', { name: 'Work with me' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('region', { name: 'What I do' })).toBeVisible()
    // Its amount is whatever the price test last saved (they run at once): only the words around it are certain.
    await expect(page.getByRole('region', { name: 'Price' })).toContainText(/ an hour/)
  })

  test("Work with me's price is the admin's to change: a currency from the list (favourites first) and an amount", async ({ page, browser }) => {
    // Each browser its own amount: they run at once against the same API.
    const amounts: Record<string, string> = { chrome: '120', edge: '130', firefox: '140', safari: '150' }
    const amount = amounts[test.info().project.name] ?? '160'
    await page.goto('/features/work-with-me')
    const price = page.getByRole('region', { name: 'Price' })
    await price.getByRole('button', { name: 'Edit the price' }).click()

    const currency = price.getByRole('combobox', { name: 'Currency' })
    await currency.click()
    await expect(page.getByRole('listbox', { name: 'Currency' }).getByRole('group').first()).toHaveAttribute('aria-label', 'Favourites')
    await page.getByRole('option', { name: /RON/ }).click()
    await expect(currency).toContainText('RON')
    await typeInto(price.getByRole('textbox', { name: 'Amount, an hour' }), amount)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/work-with-me/price') && r.request().method() === 'PUT')
    await price.getByRole('button', { name: 'Save' }).click()
    expect(await (await saved).json()).toEqual({ currency: 'RON', amount: Number(amount) })
    // The other browsers save theirs at the same time, so the page may show one of theirs: in lei, though.
    await expect(price.getByRole('form', { name: 'Edit the price' })).toBeHidden()
    await expect(price).toContainText(/\d+ lei an hour/)

    // Visitors read it; only the admin can change it.
    const visitor = await freshPage(browser)
    expect((await visitor.request.put('/api/work-with-me/price', { data: { currency: 'GBP', amount: 1 } })).status()).toBe(401)
    expect(await (await visitor.request.get('/api/work-with-me/price')).json()).toHaveProperty('currency')
    await visitor.context().close()
  })

  test('Terms can be edited by the admin', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Terms and Conditions', level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit the terms' })).toBeVisible()
  })

  test('Settings shows what visitors see, and the signed-in devices', async ({ page }) => {
    await page.goto('/settings')
    for (const name of ["What's new?", 'Apps', 'YouTube', 'About Me', 'Contact']) await expect(page.getByRole('switch', { name })).toBeChecked()
    await expect(page.getByRole('list', { name: 'Signed-in devices' }).getByText('This device')).toBeVisible()
  })

  test('Contact shows the meetings calendar', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.getByRole('region', { name: 'Meetings' })).toBeVisible()
    const month = await page.getByRole('grid').getAttribute('aria-label')
    await page.getByRole('button', { name: 'Next month' }).click()
    await expect(page.getByRole('grid')).not.toHaveAttribute('aria-label', month!)
  })

  test("the admin's own visits aren't recorded", async ({ page }) => {
    const recorded: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/analytics/events')) recorded.push(request.url())
    })
    await page.goto('/apps')
    await page.goto('/about')
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(2000)
    expect(recorded).toEqual([])
  })
})
