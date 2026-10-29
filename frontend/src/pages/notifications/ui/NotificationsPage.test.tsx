import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError, type NotificationKind } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { stubApi } from '@/test/api'
import { webPush } from '../lib/webPush'
import { CHANNELS, KINDS, NOTIFICATIONS, PUSH, pageOfNotifications } from '@/test/fixtures/notifications'
import { ADMIN, forever, renderApp, renderView, textOf } from '@/test/render'
import { formatDateTime } from '@/shared/lib/format'
import { NotificationsPage } from './NotificationsPage'

// The admin's Notifications tab: every kind of phone alert, switched on or off, and the history of what was raised.

let calls: { kinds: MockInstance<typeof api.notifications.listKinds>; save: MockInstance<typeof api.notifications.saveKind>; list: MockInstance<typeof api.notifications.list> }

beforeEach(() => {
  stubApi({ user: ADMIN })
  let kinds: NotificationKind[] = structuredClone(KINDS)
  calls = {
    kinds: vi.spyOn(api.notifications, 'listKinds').mockImplementation(async () => structuredClone(kinds)),
    save: vi.spyOn(api.notifications, 'saveKind').mockImplementation(async (kind, enabled) => {
      kinds = kinds.map((k) => (k.kind === kind ? { ...k, enabled } : k))
      return structuredClone(kinds)
    }),
    list: vi.spyOn(api.notifications, 'list').mockResolvedValue(pageOfNotifications()),
  }
  // Where they go: its own tests (AlertChannelsCard.test.tsx).
  vi.spyOn(api.notifications, 'listChannels').mockResolvedValue(structuredClone(CHANNELS))
  vi.spyOn(api.notifications, 'getPush').mockResolvedValue(structuredClone(PUSH))
  vi.spyOn(webPush, 'currentEndpoint').mockResolvedValue(null)
})

const show = (theme?: 'dark' | 'light' | 'vice') => renderView(<NotificationsPage />, { path: '/notifications', user: ADMIN, theme })
const kinds = () => page.getByRole('region', { name: 'On your phone' })
const history = () => page.getByRole('region', { name: 'History' })
const switchFor = (label: string) => kinds().getByRole('group', { name: label, exact: true })
const radio = (label: string, value: 'On' | 'Off') => switchFor(label).getByRole('radio', { name: value })
const row = (label: string) => switchFor(label).element().closest('.notification-kind')!
const items = () => history().getByRole('listitem')

describe('who sees it', () => {
  it('sends visitors who open the address home, without asking the API', async () => {
    stubApi()
    await renderApp({ path: '/notifications' })
    await expect.poll(() => location.pathname).not.toBe('/notifications')
    expect(calls.kinds).not.toHaveBeenCalled()
    expect(calls.list).not.toHaveBeenCalled()
  })

  it("is one of System's pages, after Community", async () => {
    stubApi({ user: ADMIN })
    await renderApp({ path: '/notifications' })
    await expect.element(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'System' })).toHaveAttribute('aria-current', 'page')
    const pages = page.getByRole('navigation', { name: 'System' }).getByRole('link')
    await expect.element(pages.nth(2)).toHaveTextContent('Notifications')
    await expect.element(pages.nth(1)).toHaveTextContent('Community')
    await expect.element(pages.nth(2)).toHaveAttribute('aria-current', 'page')
  })
})

describe('the kinds', () => {
  it('lists every kind under its group, in order, each with how often it came lately', async () => {
    await show()
    await expect.element(switchFor('New message')).toBeVisible()
    const groups = [...kinds().element().querySelectorAll('.notification-group')].map((g) => ({
      name: g.querySelector('legend')!.textContent,
      kinds: [...g.querySelectorAll('.notification-kind-label')].map((l) => l.textContent),
    }))
    expect(groups.map((g) => g.name)).toEqual(['Visitors', 'Community', 'Problems', 'Security'])
    expect(groups.flatMap((g) => g.kinds)).toEqual(KINDS.map((k) => k.label))
    expect(textOf(page.elementLocator(row('New message')))).toContain(`4 in 30 days · last ${formatDateTime('2026-10-22T20:15:00Z')}`)
    expect(textOf(page.elementLocator(row('API crash')))).toContain('None yet')
  })

  it('shows each one on or off, as saved', async () => {
    await show()
    await expect.element(radio('New message', 'On')).toBeChecked()
    await expect.element(radio('Site error', 'Off')).toBeChecked()
    expect(KINDS.filter((k) => k.enabled)).toHaveLength(
      kinds()
        .getByRole('radio', { name: 'On', exact: true })
        .elements()
        .filter((r) => (r as HTMLInputElement).checked).length,
    )
  })

  it('switches a kind off and on again, saved at once', async () => {
    await show()
    await expect.element(radio('Buy Me a Coffee', 'On')).toBeChecked()

    await switchFor('Buy Me a Coffee').getByText('Off').click()
    await expect.element(radio('Buy Me a Coffee', 'Off')).toBeChecked()
    expect(calls.save).toHaveBeenLastCalledWith('coffee', false)

    await switchFor('Buy Me a Coffee').getByText('On').click()
    await expect.element(radio('Buy Me a Coffee', 'On')).toBeChecked()
    expect(calls.save).toHaveBeenLastCalledWith('coffee', true)
    // Nothing else moved.
    await expect.element(radio('New subscriber', 'On')).toBeChecked()
    expect(calls.save).toHaveBeenCalledTimes(2)
  })

  it('moves the switch at once, before the API answers, and keeps it there once it does', async () => {
    let finish!: (kinds: NotificationKind[]) => void
    calls.save.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await show()
    await switchFor('Signed in').getByText('Off').click()
    await expect.element(radio('Signed in', 'Off')).toBeChecked()
    // Not locked while saving: it can be changed again, and the others too.
    await expect.element(radio('Signed in', 'On')).toBeEnabled()
    await expect.element(radio('New message', 'Off')).toBeEnabled()

    finish(KINDS.map((k) => (k.kind === 'sign-in' ? { ...k, enabled: false } : k)))
    await new Promise((resolve) => setTimeout(resolve, 50))
    await expect.element(radio('Signed in', 'Off')).toBeChecked()
  })

  it('keeps every switch as clicked when the answers come back in another order', async () => {
    const answers: ((kinds: NotificationKind[]) => void)[] = []
    calls.save.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    await show()
    await switchFor('Buy Me a Coffee').getByText('Off').click()
    await switchFor('New subscriber').getByText('Off').click()
    await expect.poll(() => answers.length).toBe(2)

    // The second save is answered first (with both off), then the first (from before the second was saved: subscriber still on).
    answers[1](KINDS.map((k) => (k.kind === 'coffee' || k.kind === 'subscriber' ? { ...k, enabled: false } : k)))
    answers[0](KINDS.map((k) => (k.kind === 'coffee' ? { ...k, enabled: false } : k)))
    await new Promise((resolve) => setTimeout(resolve, 50))

    await expect.element(radio('Buy Me a Coffee', 'Off')).toBeChecked()
    await expect.element(radio('New subscriber', 'Off')).toBeChecked()
  })

  it('ends where it was last clicked when the same switch is answered out of order', async () => {
    const answers: ((kinds: NotificationKind[]) => void)[] = []
    calls.save.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    await show()
    await switchFor('Meeting reminder').getByText('Off').click()
    await switchFor('Meeting reminder').getByText('On').click()
    await expect.poll(() => answers.length).toBe(2)

    answers[1](KINDS)
    answers[0](KINDS.map((k) => (k.kind === 'meeting-reminder' ? { ...k, enabled: false } : k)))
    await new Promise((resolve) => setTimeout(resolve, 50))

    await expect.element(radio('Meeting reminder', 'On')).toBeChecked()
  })

  it("doesn't let an older save that failed undo a newer click", async () => {
    const answers: { resolve: (kinds: NotificationKind[]) => void; reject: (e: unknown) => void }[] = []
    calls.save.mockImplementation(() => new Promise((resolve, reject) => answers.push({ resolve, reject })))
    await show()
    await switchFor('Site error').getByText('On').click()
    await switchFor('Site error').getByText('Off').click()
    await expect.poll(() => answers.length).toBe(2)

    answers[1].resolve(KINDS)
    answers[0].reject(new ApiError('/api/notifications/kinds/site-error', 500))
    await expect.element(kinds().getByRole('alert')).toBeVisible()

    await expect.element(radio('Site error', 'Off')).toBeChecked()
  })

  it('keeps the keyboard on the switch while it saves: the arrow keys switch it back and forth', async () => {
    calls.save.mockReturnValue(new Promise(() => {}))
    await show()
    const on = radio('Site error', 'Off')
    await expect.element(on).toBeChecked()
    ;(on.element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(radio('Site error', 'On')).toBeChecked()
    expect(switchFor('Site error').element().contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(radio('Site error', 'Off')).toBeChecked()
    expect(switchFor('Site error').element().contains(document.activeElement)).toBe(true)
    expect(calls.save.mock.calls).toEqual([
      ['site-error', true],
      ['site-error', false],
    ])
  })

  it("says when a switch couldn't be saved, and keeps it as it was", async () => {
    calls.save.mockRejectedValueOnce(new ApiError('/api/notifications/kinds/message', 500))
    await show()
    await switchFor('New message').getByText('Off').click()
    await expect.element(kinds().getByRole('alert')).toHaveTextContent("That couldn't be saved. Please try again.")
    // It moved at once, then went back.
    await expect.element(radio('New message', 'On')).toBeChecked()

    await switchFor('New message').getByText('Off').click()
    await expect.element(radio('New message', 'Off')).toBeChecked()
    expect(kinds().getByRole('alert').query()).toBeNull()
  })

  it('shows placeholders while loading, and a retry when the kinds fail', async () => {
    calls.kinds.mockReturnValueOnce(forever())
    const loading = await show()
    await expect.element(kinds().getByRole('status')).toHaveTextContent('Loading the notifications…')
    await loading.unmount()

    calls.kinds.mockRejectedValueOnce(new ApiError('/api/notifications/kinds', 500))
    await show()
    await expect.element(kinds().getByText("The notifications couldn't be loaded.")).toBeVisible()
    await kinds().getByRole('button', { name: 'Try again' }).click()
    await expect.element(switchFor('New message')).toBeVisible()
  })
})

describe('the history', () => {
  it('lists what was raised, newest first: its kind, title (a link to its page), message, what became of it, and when', async () => {
    await show()
    await expect.poll(() => items().elements().length).toBe(3)
    const [first, second, third] = items().elements()
    expect(first.querySelector('.chip')!.textContent).toBe('New message')
    expect(first.querySelector('a')!.getAttribute('href')).toBe('/contact')
    expect(first.textContent).toContain('Hello! I loved the Space Game.')
    expect(first.textContent).toContain('Sent')
    expect(first.querySelector('time')!.getAttribute('dateTime')).toBe(NOTIFICATIONS[0].createdAt)
    expect(second.textContent).toContain('Off: not sent')
    expect(third.textContent).toContain('Failed')
    // Without a page to open, the title isn't a link.
    expect(third.querySelector('a')).toBeNull()
    expect(textOf(history())).toContain('3 in all')
  })

  it('marks what never reached the phone apart from what did', async () => {
    await show()
    await expect.poll(() => items().elements().length).toBe(3)
    const [sent, off] = items().elements()
    expect(sent.getAttribute('data-status')).toBe('sent')
    expect(off.getAttribute('data-status')).toBe('off')
    expect(Number(getComputedStyle(off).opacity)).toBeLessThan(Number(getComputedStyle(sent).opacity))
  })

  it('keeps it to one kind, from the first page, and back to every kind', async () => {
    calls.list.mockImplementation(async (pageNumber = 1, _size, kind) => pageOfNotifications(kind ? [NOTIFICATIONS[0]] : NOTIFICATIONS, kind ? 1 : 45, pageNumber))
    await show()
    const pager = history().getByRole('navigation', { name: 'Pagination' })
    await pager.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => calls.list.mock.calls.at(-1)?.slice(0, 3)).toEqual([2, 20, null])

    await history().getByRole('combobox', { name: 'Kind' }).selectOptions('New message')
    await expect.poll(() => calls.list.mock.calls.at(-1)?.slice(0, 3)).toEqual([1, 20, 'message'])
    await expect.poll(() => items().elements().length).toBe(1)

    // Back to every kind: the first page, as loaded before (the store keeps it).
    await history().getByRole('combobox', { name: 'Kind' }).selectOptions('Every kind')
    await expect.poll(() => items().elements().length).toBe(3)
    await expect.poll(() => textOf(history())).toContain('45 in all')
  })

  it('offers every kind to pick from', async () => {
    await show()
    await expect.poll(() => history().getByRole('option').elements().length).toBe(KINDS.length + 1)
    expect(
      history()
        .getByRole('option')
        .elements()
        .map((o) => o.textContent),
    ).toEqual(['Every kind', ...KINDS.map((k) => k.label)])
  })

  it('pages through a long history', async () => {
    calls.list.mockImplementation(async (pageNumber = 1) => pageOfNotifications(NOTIFICATIONS, 45, pageNumber))
    await show()
    const pager = history().getByRole('navigation', { name: 'Pagination' })
    await expect.poll(() => textOf(pager)).toContain('Page 1 of 3')
    await pager.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => textOf(pager)).toContain('Page 2 of 3')
    await pager.getByRole('button', { name: 'Previous' }).click()
    await expect.poll(() => textOf(pager)).toContain('Page 1 of 3')
  })

  it('says when there is nothing yet, and when it could not be loaded', async () => {
    calls.list.mockResolvedValueOnce(pageOfNotifications([], 0))
    const empty = await show()
    await expect.element(history().getByText('Nothing here yet')).toBeVisible()
    await empty.unmount()

    calls.list.mockRejectedValueOnce(new ApiError('/api/notifications', 500))
    await show()
    await expect.element(history().getByText("The history couldn't be loaded.")).toBeVisible()
    await history().getByRole('button', { name: 'Try again' }).click()
    await expect.poll(() => items().elements().length).toBe(3)
  })

  it('loads the kinds and the history again with Refresh: what came while the page was open', async () => {
    await show()
    await expect.poll(() => items().elements().length).toBe(3)
    const before = [calls.kinds.mock.calls.length, calls.list.mock.calls.length]
    calls.list.mockResolvedValue(pageOfNotifications([{ ...NOTIFICATIONS[0], id: 9, title: 'New message from Bo' }, ...NOTIFICATIONS], 4))

    await history().getByRole('button', { name: 'Refresh' }).click()

    await expect.poll(() => items().elements().length).toBe(4)
    expect(textOf(items().first())).toContain('New message from Bo')
    expect(calls.kinds.mock.calls.length).toBeGreaterThan(before[0])
    expect(calls.list.mock.calls.length).toBeGreaterThan(before[1])
  })

  it('links a title only to a page on this site', async () => {
    calls.list.mockResolvedValueOnce(
      pageOfNotifications([
        { ...NOTIFICATIONS[0], id: 11, title: 'Elsewhere', path: 'https://example.com/x' },
        { ...NOTIFICATIONS[0], id: 12, title: 'Protocol-relative', path: '//example.com/x' },
        { ...NOTIFICATIONS[0], id: 13, title: 'Here', path: '/community' },
      ]),
    )
    await show()
    await expect.poll(() => items().elements().length).toBe(3)
    const links = history()
      .getByRole('link')
      .elements()
      .map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([['Here', '/community']])
  })

  it('names a kind it no longer knows by its key', async () => {
    calls.list.mockResolvedValueOnce(pageOfNotifications([{ ...NOTIFICATIONS[0], kind: 'retired-kind' }]))
    await show()
    await expect.poll(() => items().elements().length).toBe(1)
    expect(items().element().querySelector('.chip')!.textContent).toBe('retired-kind')
  })
})

describe('accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      await show(theme)
      await expect.poll(() => items().elements().length).toBe(3)
      await expect.element(switchFor('New message')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
