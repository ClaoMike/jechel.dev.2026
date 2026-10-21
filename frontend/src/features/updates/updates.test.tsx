import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { api as apiService, ApiError } from '../../services/api'
import { makeStore } from '../../store'
import { communityApi } from '../../store/api/communityApi'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { SITE } from '../../test/fixtures/site'
import { renderApp, shootWhole, textOf } from '../../test/render'

const dialog = () => page.getByRole('dialog', { name: 'Get updates' })
const email = () => dialog().getByRole('textbox', { name: 'Email' })
const subscribe = () => dialog().getByRole('button', { name: 'Subscribe' })
const openDialog = async () => {
  await page.getByRole('button', { name: 'Get updates by email' }).click()
  await expect.element(dialog()).toBeVisible()
}

describe('"Get updates"', () => {
  it('is in the header only while updates are switched on', async () => {
    const api = stubApi()
    api.site.status.mockResolvedValue({ ...SITE, features: { ...SITE.features, updates: false } })
    await renderApp()
    await expect.element(page.getByRole('link', { name: /Buy me a coffee/ })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Get updates by email' })).not.toBeInTheDocument()
  })

  it('opens with the email box focused, and checks the address before sending it', async () => {
    const api = stubApi()
    await renderApp()
    await openDialog()
    await expect.element(email()).toHaveFocus()
    await email().fill('not an email')
    await subscribe().click()
    await expect.element(email()).toHaveAccessibleDescription('Enter a valid email address.')
    await expect.element(email()).toHaveAttribute('aria-invalid', 'true')
    expect(api.updates.subscribe).not.toHaveBeenCalled()
  })

  it('sends the address (trimmed) and says to check the email for the confirmation link', async () => {
    const api = stubApi()
    await renderApp()
    await openDialog()
    await email().fill('  reader@example.com ')
    await subscribe().click()
    expect(api.updates.subscribe).toHaveBeenCalledWith('reader@example.com')
    await expect.poll(() => textOf(dialog().getByRole('status'))).toBe('Almost there: check reader@example.com and click the link in the email to confirm.')
    await expect.element(dialog().getByText('Nothing arrived? Look in spam, or try again in 10 minutes.')).toBeVisible()
    await dialog().getByRole('button', { name: 'Done' }).click()
    await expect.element(dialog()).not.toBeInTheDocument()
  })

  it('says when a confirmation was already sent, or the address is already subscribed', async () => {
    const api = stubApi()
    api.updates.subscribe.mockResolvedValueOnce('pending').mockResolvedValueOnce('alreadySubscribed')
    await renderApp()
    await openDialog()
    await email().fill('reader@example.com')
    await subscribe().click()
    await expect.poll(() => textOf(dialog().getByRole('status'))).toBe('We already sent a confirmation to reader@example.com. Click the link in that email to confirm.')
    await dialog().getByRole('button', { name: 'Done' }).click()
    await openDialog()
    await email().fill('reader@example.com')
    await subscribe().click()
    await expect.poll(() => textOf(dialog().getByRole('status'))).toBe("reader@example.com is already subscribed: you'll get an email when there's something new.")
    await expect.element(dialog().getByText(/Nothing arrived/)).not.toBeInTheDocument()
  })

  it("waits while sending, then explains what went wrong: the API's word on the address, too many tries, anything else", async () => {
    const api = stubApi()
    let fail!: (e: unknown) => void
    api.updates.subscribe
      .mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
      .mockRejectedValueOnce(new ApiError('/api/updates', 429))
      .mockRejectedValueOnce(new ApiError('/api/updates', 500))
    await renderApp()
    await openDialog()
    await email().fill('reader@example.com')
    await subscribe().click()
    await expect.element(dialog().getByRole('button', { name: 'Subscribing…' })).toBeDisabled()
    fail(new ApiError('/api/updates', 400, { email: ['That domain does not take email.'] }))
    await expect.element(email()).toHaveAccessibleDescription('That domain does not take email.')
    await subscribe().click()
    await expect.poll(() => textOf(dialog().getByRole('alert'))).toBe('Too many tries. Please try again in a few minutes.')
    await subscribe().click()
    await expect.poll(() => textOf(dialog().getByRole('alert'))).toBe("That didn't work. Please try again later.")
  })
})

describe('"Get updates": more ways it can go', () => {
  it('says when updates were switched off since the page loaded, and when the email could not be sent', async () => {
    const api = stubApi()
    api.updates.subscribe.mockRejectedValueOnce(new ApiError('/api/updates/subscribe', 404)).mockRejectedValueOnce(new ApiError('/api/updates/subscribe', 503))
    await renderApp()
    await openDialog()
    await email().fill('reader@example.com')
    await subscribe().click()
    await expect.poll(() => textOf(dialog().getByRole('alert'))).toBe("Email updates aren't open right now. Please try again later.")
    await subscribe().click()
    await expect.poll(() => textOf(dialog().getByRole('alert'))).toBe("That didn't work. Please try again later.")
    // What was typed stays, to try again.
    await expect.element(email()).toHaveValue('reader@example.com')
  })

  it('sends with Enter, and a fixed address clears its error', async () => {
    const api = stubApi()
    await renderApp()
    await openDialog()
    await email().fill('reader@')
    await userEvent.keyboard('{Enter}')
    await expect.element(email()).toHaveAccessibleDescription('Enter a valid email address.')
    expect(api.updates.subscribe).not.toHaveBeenCalled()

    await email().fill('reader@example.com')
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => textOf(dialog().getByRole('status'))).toContain('Almost there')
    expect(api.updates.subscribe).toHaveBeenCalledWith('reader@example.com')
  })

  it('closes with Escape or Close, and opens again empty', async () => {
    stubApi()
    await renderApp()
    await openDialog()
    await email().fill('half typed')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog()).not.toBeInTheDocument()
    await openDialog()
    await expect.element(email()).toHaveValue('')
    await dialog().getByRole('button', { name: 'Close' }).click()
    await expect.element(dialog()).not.toBeInTheDocument()
  })

  it('a second press while sending sends nothing more', async () => {
    const api = stubApi()
    let finish!: (status: 'sent') => void
    api.updates.subscribe.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await renderApp()
    await openDialog()
    await email().fill('reader@example.com')
    await subscribe().click()
    await expect.element(dialog().getByRole('button', { name: 'Subscribing…' })).toBeDisabled()
    await userEvent.keyboard('{Enter}')
    finish('sent')
    await expect.poll(() => textOf(dialog().getByRole('status'))).toContain('Almost there')
    expect(api.updates.subscribe).toHaveBeenCalledTimes(1)
  })
})

describe("confirming or unsubscribing refreshes the admin's list", () => {
  it('loads the subscribers again after either', async () => {
    const api = stubApi()
    const list = vi.spyOn(apiService.updates, 'listSubscribers').mockResolvedValue({ items: [], page: 1, pageSize: 20, totalCount: 0 })
    const store = makeStore()
    const watching = store.dispatch(communityApi.endpoints.listSubscribers.initiate({ page: 1, pageSize: 20 }))
    await expect.poll(() => list.mock.calls.length).toBe(1)

    await store.dispatch(communityApi.endpoints.unsubscribe.initiate('t1'))
    await expect.poll(() => list.mock.calls.length).toBe(2)
    await store.dispatch(communityApi.endpoints.confirmSubscription.initiate('t2'))
    await expect.poll(() => list.mock.calls.length).toBe(3)

    expect(api.updates.unsubscribe).toHaveBeenCalledWith('t1')
    expect(api.updates.confirm).toHaveBeenCalledWith('t2')
    watching.unsubscribe()
  })
})

describe('the links in the update emails', () => {
  it('confirms the subscription from the link, and says as whom', async () => {
    const api = stubApi()
    await renderApp({ path: '/updates/confirm?token=abc' })
    await expect.poll(() => textOf(page.getByRole('status'))).toBe("You're subscribed as reader@example.com. You'll get an email when there's a new app or video.")
    expect(api.updates.confirm).toHaveBeenCalledWith('abc')
    await expect.element(page.getByRole('link', { name: "See what's new" })).toHaveAttribute('href', '/')
  })

  it('says "Confirming…" meanwhile, and works without the address too', async () => {
    const api = stubApi()
    let finish!: (email: string) => void
    api.updates.confirm.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await renderApp({ path: '/updates/confirm?token=abc' })
    await expect.element(page.getByText('Confirming…')).toBeVisible()
    finish('')
    await expect.poll(() => textOf(page.getByRole('status'))).toBe("You're subscribed. You'll get an email when there's a new app or video.")
  })

  it('says a link is no longer valid (no token, or unknown), or that it failed', async () => {
    const api = stubApi()
    const none = await renderApp({ path: '/updates/confirm' })
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe('This link isn\'t valid any more. Subscribe again with "Get updates" at the top of the page.')
    expect(api.updates.confirm).not.toHaveBeenCalled()
    await none.unmount()
    api.updates.confirm.mockRejectedValueOnce(new ApiError('/api/updates/confirm', 404))
    const unknown = await renderApp({ path: '/updates/confirm?token=old' })
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("isn't valid any more")
    await unknown.unmount()
    api.updates.confirm.mockRejectedValueOnce(new ApiError('/api/updates/confirm', 500))
    await renderApp({ path: '/updates/confirm?token=abc' })
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe("That didn't work. Please try the link again later.")
  })

  it('unsubscribes from the link', async () => {
    const api = stubApi()
    await renderApp({ path: '/updates/unsubscribe?token=xyz' })
    await expect.poll(() => textOf(page.getByRole('status'))).toBe("You're unsubscribed: no more emails. Sorry to see you go.")
    expect(api.updates.unsubscribe).toHaveBeenCalledWith('xyz')
    await expect.element(page.getByRole('link', { name: 'Back to the site' })).toBeVisible()
  })

  it('says an unsubscribe link is incomplete, or that it failed', async () => {
    const api = stubApi()
    const none = await renderApp({ path: '/updates/unsubscribe' })
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe("This link isn't complete. Open it again from the email.")
    await none.unmount()
    api.updates.unsubscribe.mockRejectedValueOnce(new ApiError('/api/updates/unsubscribe', 500))
    await renderApp({ path: '/updates/unsubscribe?token=xyz' })
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe("That didn't work. Please try the link again later.")
  })
})

describe("a test email's links", () => {
  it('say they come from a test and change nothing, without asking the API', async () => {
    const api = stubApi()
    const confirm = await renderApp({ path: '/updates/confirm?token=test' })
    await expect
      .poll(() => textOf(page.getByRole('status')))
      .toBe('This link is from a test email, so it changes nothing. The button in the real confirmation email confirms the subscription.')
    await confirm.unmount()

    await renderApp({ path: '/updates/unsubscribe?token=test' })
    await expect.poll(() => textOf(page.getByRole('status'))).toBe("This link is from a test email, so it changes nothing: you weren't subscribed when it was sent.")
    expect(api.updates.confirm).not.toHaveBeenCalled()
    expect(api.updates.unsubscribe).not.toHaveBeenCalled()
    expect(page.getByRole('alert').query()).toBeNull()
  })
})

describe('updates, screenshots and accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: the popup (form, error, sent) and the confirmation page`, async () => {
      const api = stubApi()
      const app = await renderApp({ theme })
      await openDialog()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(dialog(), `${theme}-subscribe`)
      await subscribe().click()
      await expect.element(email()).toHaveAttribute('aria-invalid', 'true')
      expect(await a11yViolations()).toEqual([])
      await shootWhole(dialog(), `${theme}-subscribe-invalid`)
      await email().fill('reader@example.com')
      await subscribe().click()
      await expect.element(dialog().getByRole('button', { name: 'Done' })).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(dialog(), `${theme}-subscribe-sent`)
      await app.unmount()
      expect(api.updates.subscribe).toHaveBeenCalledOnce()

      await renderApp({ theme, path: '/updates/confirm?token=abc' })
      await expect.element(page.getByRole('status')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-confirmed`)
    })
  }
})
