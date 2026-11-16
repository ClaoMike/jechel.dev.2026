import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError } from '@/shared/api'
import { stubApi } from '@/test/api'
import { TERMS } from '@/test/fixtures/site'
import { renderApp } from '@/test/render'
import { tracker } from '@/shared/lib/analytics'

// Visits are recorded only once the visitor has accepted the terms (which say what's recorded).
// The site's own tracker, through the whole app; what it sends is caught by the stubbed api.analytics.

const gate = () => page.getByRole('dialog', { name: 'Welcome to jechel.dev' })

/** A page of its own for each test: the tracker counts the same page twice in a row once, and it's the site's one instance. */
let visits = 0
const freshPath = () => `/youtube?visit=${++visits}`

/** Sends what's waiting now, then what went out: the event types of every batch. */
async function sent(api: ReturnType<typeof stubApi>) {
  await tracker.flush()
  return api.analytics.send.mock.calls.flatMap(([batch]) => batch.events.map((e) => `${e.type} ${e.path}`))
}

describe('recording a visit', () => {
  // The tracker is the site's one instance: forget what a test left behind.
  afterEach(() => tracker.setMode('off'))

  it('records nothing while the welcome popup is up, and nothing for a visitor who never accepts', async () => {
    const api = stubApi()
    await renderApp({ path: freshPath(), acceptedTerms: null })
    await expect.element(gate()).toBeVisible()

    expect(tracker.state.mode).toBe('off')
    expect(tracker.state.queued).toEqual([])
    expect(await sent(api)).toEqual([])
    expect(api.analytics.beacon).not.toHaveBeenCalled()
  })

  it('starts once the terms are accepted, with the page the visit began on and the acceptance, keeping nothing from before', async () => {
    const api = stubApi()
    const path = freshPath()
    await renderApp({ path, acceptedTerms: null })
    await gate().getByRole('checkbox').click()
    await gate().getByRole('button', { name: 'Continue' }).click()

    await expect.poll(() => tracker.state.mode).toBe('on')
    await expect.poll(() => sent(api)).toEqual([`pageview ${path}`, `event ${path}`])
    expect(api.analytics.send.mock.calls.flatMap(([batch]) => batch.events)[1].label).toBe('Terms accepted')
    // The tick and the button under the welcome popup were before accepting: not recorded.
    expect(api.analytics.send.mock.calls.flatMap(([batch]) => batch.events).some((e) => e.type === 'click')).toBe(false)
  })

  it('records what the visitor does once they accepted', async () => {
    const api = stubApi()
    await renderApp({ path: freshPath(), acceptedTerms: null })
    await gate().getByRole('checkbox').click()
    await gate().getByRole('button', { name: 'Continue' }).click()
    await expect.poll(() => tracker.state.mode).toBe('on')
    await page.getByRole('link', { name: 'Apps' }).click()
    await expect.poll(async () => (await sent(api)).at(-1)).toBe('pageview /apps')
    const events = api.analytics.send.mock.calls.flatMap(([batch]) => batch.events)
    expect(events.some((e) => e.type === 'click' && e.label === 'Apps')).toBe(true)
  })

  it('records a visitor who accepted these terms before, from the start, without accepting again', async () => {
    const api = stubApi()
    const path = freshPath()
    await renderApp({ path })

    await expect.poll(() => tracker.state.mode).toBe('on')
    await expect.poll(() => sent(api)).toContain(`pageview ${path}`)
    expect(api.analytics.send.mock.calls.flatMap(([batch]) => batch.events).some((e) => e.label === 'Terms accepted')).toBe(false)
  })

  it('waits again when the terms have changed since they were accepted', async () => {
    const api = stubApi()
    await renderApp({ acceptedTerms: '2025-01-01T00:00:00Z' })
    await expect.element(gate()).toBeVisible()

    expect(tracker.state.mode).toBe('off')
    expect(await sent(api)).toEqual([])
  })

  it("records a visitor who accepted before while the terms can't be loaded, but not one who never did", async () => {
    const before = stubApi()
    before.terms.get.mockRejectedValue(new ApiError('/api/terms', 503))
    const accepted = await renderApp({ acceptedTerms: TERMS.updatedAt })
    await expect.poll(() => tracker.state.mode).toBe('on')
    await accepted.unmount()
    tracker.setMode('off')

    const never = stubApi()
    never.terms.get.mockRejectedValue(new ApiError('/api/terms', 503))
    await renderApp({ acceptedTerms: null })
    await expect.element(gate()).toBeVisible()
    expect(tracker.state.mode).toBe('off')
  })

  it('never records the signed-in admin', async () => {
    const api = stubApi({ user: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } })
    await renderApp({ acceptedTerms: null })

    await expect.poll(() => tracker.state.mode).toBe('off')
    expect(await sent(api)).toEqual([])
  })

  it('records each theme switch, and says the theme the visit started and is in with every batch', async () => {
    const api = stubApi()
    await renderApp({ path: freshPath() })
    await expect.poll(() => tracker.state.mode).toBe('on')
    const start = document.documentElement.dataset.theme
    const other = start === 'light' ? 'dark' : 'light'
    await page.getByTitle(`${other === 'light' ? 'Light' : 'Dark'} mode`).click()
    await expect.poll(async () => (await sent(api)).some((e) => e.startsWith('event'))).toBe(true)
    const events = api.analytics.send.mock.calls.flatMap(([batch]) => batch.events)
    const switched = events.find((e) => e.label === 'Theme changed')!
    expect(switched.detail).toEqual({ from: start, to: other })
    const batch = api.analytics.send.mock.calls.at(-1)![0]
    expect(batch.session.currentTheme).toBe(other)
    expect(batch.session.theme).toBe(start)
  })
})
