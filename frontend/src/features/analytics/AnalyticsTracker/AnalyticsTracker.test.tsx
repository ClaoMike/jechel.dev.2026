import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError } from '../../../services/api'
import { stubApi } from '../../../test/api'
import { TERMS } from '../../../test/fixtures/site'
import { renderApp } from '../../../test/render'
import { tracker } from '../tracker'

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

  it('waits while the welcome popup is up, and records nothing for a visitor who never accepts', async () => {
    const api = stubApi()
    await renderApp({ path: freshPath(), acceptedTerms: null })
    await expect.element(gate()).toBeVisible()

    expect(tracker.state.mode).toBe('waiting')
    expect(await sent(api)).toEqual([])
    expect(api.analytics.beacon).not.toHaveBeenCalled()
  })

  it('starts once the terms are accepted, with the page the visit began on', async () => {
    const api = stubApi()
    const path = freshPath()
    await renderApp({ path, acceptedTerms: null })
    await gate().getByRole('checkbox').click()
    await gate().getByRole('button', { name: 'Continue' }).click()

    await expect.poll(() => tracker.state.mode).toBe('on')
    await expect.poll(() => sent(api)).toContain(`pageview ${path}`)
  })

  it('records a visitor who accepted these terms before, from the start', async () => {
    const api = stubApi()
    const path = freshPath()
    await renderApp({ path })

    await expect.poll(() => tracker.state.mode).toBe('on')
    await expect.poll(() => sent(api)).toContain(`pageview ${path}`)
  })

  it('waits again when the terms have changed since they were accepted', async () => {
    const api = stubApi()
    await renderApp({ acceptedTerms: '2025-01-01T00:00:00Z' })
    await expect.element(gate()).toBeVisible()

    expect(tracker.state.mode).toBe('waiting')
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
    expect(tracker.state.mode).toBe('waiting')
  })

  it('never records the signed-in admin', async () => {
    const api = stubApi({ user: { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 } })
    await renderApp({ acceptedTerms: null })

    await expect.poll(() => tracker.state.mode).toBe('off')
    expect(await sent(api)).toEqual([])
  })
})
