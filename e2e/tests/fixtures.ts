/**
 * What every test file uses: `test` keeps each page on this computer (requests anywhere else, such as YouTube's
 * player, are answered with an empty page), and helpers for the admin's API and for what the stand-ins received.
 */
import { test as base, expect, request, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { ADMIN_STATE } from './states.ts'

export const WEB_URL = `http://localhost:${process.env.E2E_WEB_PORT ?? '4273'}`
export const SERVICES_URL = `http://localhost:${process.env.E2E_SERVICES_PORT ?? '5299'}`

/**
 * No graphics card (CI's runners): everything is drawn by the CPU. Real Safari always has one (Apple's hardware), but
 * WebKit on Linux without it draws the frosted glass (backdrop-filter) at a frame every few seconds, so Playwright waits
 * forever for a button to hold still: the blur is left out there. Vice's scene, drawn by the CPU next to three other
 * browsers, is just as slow: tests in Vice ask for reduced motion there (it draws one still frame), see `viceMotion`.
 */
export const NO_GPU = !!process.env.CI
/** For tests in Vice: the scene moves where there's a graphics card, holds still where there isn't (NO_GPU). */
export const viceMotion = { reducedMotion: NO_GPU ? ('reduce' as const) : ('no-preference' as const) }

export const test = base.extend<{ blockOutside: void; noBlurWithoutGpu: void }>({
  noBlurWithoutGpu: [
    async ({ context, browserName }, use) => {
      if (NO_GPU && browserName === 'webkit') {
        await context.addInitScript(() =>
          document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style')
            style.textContent = '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }'
            document.head.append(style)
          }),
        )
      }
      await use()
    },
    { auto: true },
  ],
  blockOutside: [
    async ({ context }, use) => {
      await context.route(
        (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
        (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Outside</title>' }),
      )
      await use()
    },
    { auto: true },
  ],
})
export { expect }

/** The API as the signed-in admin, as the site calls it (same origin: writes need the Origin header). */
export async function adminApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: WEB_URL, storageState: ADMIN_STATE, extraHTTPHeaders: { Origin: WEB_URL } })
}

export interface SentEmail {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  headers: Record<string, string>
}

/** The emails "sent" through the stand-in for Resend to this address, oldest first; waits for at least `count`. */
export async function emailsTo(address: string, count = 1): Promise<SentEmail[]> {
  let found: SentEmail[] = []
  await expect
    .poll(async () => {
      const all = (await (await fetch(`${SERVICES_URL}/sent/emails`)).json()) as SentEmail[]
      found = all.filter((email) => email.to.includes(address))
      return found.length
    })
    .toBeGreaterThanOrEqual(count)
  return found
}

export interface SentAlert {
  topic: string
  title: string
  message: string
}

/** The phone alerts "sent" through the stand-in for ntfy, oldest first. */
export async function alerts(): Promise<SentAlert[]> {
  return (await (await fetch(`${SERVICES_URL}/sent/alerts`)).json()) as SentAlert[]
}

/** A name no other browser's test uses, so tests running at once never see each other's data. */
export function unique(prefix: string, page: Page | { browserName: string }) {
  const browser = 'browserName' in page ? page.browserName : (page.context().browser()?.browserType().name() ?? 'browser')
  return `${prefix} ${browser} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
}

/** The first link in an email's text that goes to this path on the site. */
export function linkIn(email: SentEmail, path: string): string {
  const match = email.text.match(new RegExp(`https?://[^\\s)]+${path.replace(/\//g, '\\/')}[^\\s)]*`))
  if (!match) throw new Error(`No ${path} link in "${email.subject}":\n${email.text}`)
  return match[0]
}

/**
 * Types into a field key by key, as a person does. (Playwright's `fill` sets the value in one go; in the real Firefox,
 * driven over WebDriver BiDi, that doesn't fire the input events the site listens for yet.)
 */
export async function typeInto(field: Locator, text: string) {
  await field.clear()
  await field.pressSequentially(text)
}

/** A tap on a phone; a click in Firefox, where Playwright can't touch yet (WebDriver BiDi). */
export async function tap(target: Locator, browserName: string) {
  if (browserName === 'firefox') await target.click()
  else await target.tap()
}
