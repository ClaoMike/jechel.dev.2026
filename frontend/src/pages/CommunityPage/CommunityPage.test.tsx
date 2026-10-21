import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { api, ApiError, type Announcement, type Donation, type Page, type Subscriber } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { ADMIN, forever, renderView, textOf } from '../../test/render'
import { formatDate, formatDateTime } from '../../utils/formatDate'
import { CommunityPage } from './CommunityPage'

// The admin's Community tab: subscribers, the update emails (new apps wait to be sent or ignored), and coffees.

const pageOf = <T,>(items: T[], totalCount = items.length): Page<T> => ({ items, page: 1, pageSize: 20, totalCount })

const SUBSCRIBERS: Subscriber[] = [
  { id: 1, email: 'ada@example.com', createdAt: '2026-10-01T09:00:00Z', confirmedAt: '2026-10-01T09:05:00Z' },
  { id: 2, email: 'bob@example.com', createdAt: '2026-10-02T09:00:00Z', confirmedAt: null },
]
const ANNOUNCEMENTS: Announcement[] = [
  { id: 10, kind: 'app', title: 'Space Game', status: 'pending', createdAt: '2026-10-20T09:00:00Z', sentAt: null, recipientCount: 0 },
  { id: 11, kind: 'video', title: 'Devlog 1', status: 'sent', createdAt: '2026-10-19T09:00:00Z', sentAt: '2026-10-19T09:10:00Z', recipientCount: 1 },
  { id: 12, kind: 'video', title: 'Devlog 2', status: 'sent', createdAt: '2026-10-18T09:00:00Z', sentAt: '2026-10-18T09:10:00Z', recipientCount: 3 },
  { id: 13, kind: 'app', title: 'Old Game', status: 'ignored', createdAt: '2026-10-17T09:00:00Z', sentAt: null, recipientCount: 0 },
  { id: 14, kind: 'app', title: 'Next Game', status: 'approved', createdAt: '2026-10-16T09:00:00Z', sentAt: null, recipientCount: 0 },
]
const DONATIONS: Donation[] = [
  { id: 1, type: 'donation.created', fromName: 'Ada', message: 'Thanks!', amount: '3.00', currency: 'GBP', email: 'ada@example.com', receivedAt: '2026-10-10T09:00:00Z' },
  { id: 2, type: 'membership.started', fromName: 'Bob', message: null, amount: '5.00', currency: 'USD', email: null, receivedAt: '2026-10-11T09:00:00Z' },
]

function stub() {
  vi.spyOn(api.auth, 'me').mockResolvedValue(ADMIN)
  return {
    subscribers: vi.spyOn(api.updates, 'listSubscribers').mockResolvedValue(pageOf(SUBSCRIBERS)),
    deleteSubscriber: vi.spyOn(api.updates, 'deleteSubscriber').mockResolvedValue(),
    announcements: vi.spyOn(api.updates, 'listAnnouncements').mockResolvedValue(pageOf(ANNOUNCEMENTS)),
    decide: vi.spyOn(api.updates, 'decide').mockResolvedValue('approved'),
    donations: vi.spyOn(api.support, 'listDonations').mockResolvedValue(pageOf(DONATIONS)),
  }
}

const show = (theme?: 'dark' | 'light' | 'vice') => renderView(<CommunityPage />, { user: ADMIN, theme })
const section = (name: string) => page.getByRole('region', { name })
const subscribers = () => section('Email subscribers')
const updates = () => section('Update emails')
const coffees = () => section('Coffees (Buy Me a Coffee)')
const row = (text: string) => page.getByRole('row').filter({ hasText: text })
const item = (title: string) => updates().getByRole('listitem').filter({ hasText: title })

describe('Community: email subscribers', () => {
  it('lists them, confirmed or waiting, with when they signed up and how many in all', async () => {
    stub()
    await show()
    await expect.element(row('ada@example.com')).toBeVisible()
    expect(textOf(row('ada@example.com'))).toContain('Confirmed')
    expect(textOf(row('ada@example.com'))).toContain(formatDate(SUBSCRIBERS[0].createdAt))
    expect(textOf(row('bob@example.com'))).toContain('Waiting for confirmation')
    expect(textOf(subscribers())).toContain('2 in all')
  })

  it('deletes one after asking, and the list loads again', async () => {
    const api = stub()
    await show()
    api.subscribers.mockResolvedValue(pageOf([SUBSCRIBERS[0]]))
    await row('bob@example.com').getByRole('button', { name: 'Delete bob@example.com' }).click()
    await page.getByRole('dialog', { name: 'Delete bob@example.com?' }).getByRole('button', { name: 'Delete', exact: true }).click()
    expect(api.deleteSubscriber).toHaveBeenCalledWith(2)
    await expect.poll(() => row('bob@example.com').query()).toBeNull()
  })

  it('says when there are none yet', async () => {
    const api = stub()
    api.subscribers.mockResolvedValue(pageOf([]))
    await show()
    await expect.element(subscribers().getByText('No subscribers yet.')).toBeVisible()
  })

  it("says when they couldn't be loaded, and tries again", async () => {
    const api = stub()
    api.subscribers.mockRejectedValueOnce(new ApiError('/api/updates/subscribers', 500))
    await show()
    await expect.poll(() => textOf(subscribers().getByRole('alert'))).toContain("Subscribers couldn't be loaded.")
    await subscribers().getByRole('button', { name: 'Try again' }).click()
    await expect.element(row('ada@example.com')).toBeVisible()
  })

  it('pages through more than 20', async () => {
    const api = stub()
    api.subscribers.mockImplementation(async (p = 1) => ({ ...pageOf(SUBSCRIBERS, 25), page: p }))
    await show()
    await expect.element(subscribers().getByText('Page 1 of 2')).toBeVisible()
    await subscribers().getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => api.subscribers.mock.calls.map(([p]) => p)).toContain(2)
  })
})

describe('Community: update emails', () => {
  it("shows each email's kind, title, status and when (sent: to how many)", async () => {
    stub()
    await show()
    await expect.element(item('Space Game')).toBeVisible()
    expect(textOf(item('Space Game'))).toContain('App')
    expect(textOf(item('Space Game'))).toContain('Waiting for you')
    expect(textOf(item('Space Game'))).toContain(formatDateTime(ANNOUNCEMENTS[0].createdAt))
    expect(textOf(item('Devlog 1'))).toContain(`${formatDateTime(ANNOUNCEMENTS[1].sentAt!)} · to 1 subscriber`)
    expect(textOf(item('Devlog 2'))).toContain('to 3 subscribers')
    expect(textOf(item('Old Game'))).toContain('Not sent')
    expect(textOf(item('Next Game'))).toContain('To be sent')
  })

  it('offers Send email and Ignore only for one waiting for you', async () => {
    stub()
    await show()
    await expect.element(item('Space Game').getByRole('button', { name: 'Send email' })).toBeVisible()
    expect(item('Devlog 1').getByRole('button').query()).toBeNull()
    expect(item('Next Game').getByRole('button').query()).toBeNull()
  })

  it('sends or ignores it, and the list loads again', async () => {
    const api = stub()
    await show()
    await item('Space Game').getByRole('button', { name: 'Send email' }).click()
    await expect.poll(() => api.decide.mock.calls).toEqual([[10, 'send']])
    await item('Space Game').getByRole('button', { name: 'Ignore' }).click()
    await expect.poll(() => api.decide.mock.calls).toEqual([[10, 'send'], [10, 'ignore']])
    await expect.poll(() => api.announcements.mock.calls.length).toBeGreaterThan(1)
  })

  it('says when deciding failed', async () => {
    const api = stub()
    api.decide.mockRejectedValue(new ApiError('/api/updates/announcements/10/send', 500))
    await show()
    await item('Space Game').getByRole('button', { name: 'Send email' }).click()
    await expect.poll(() => textOf(updates().getByRole('alert'))).toBe("That didn't work. Please try again.")
  })

  it('explains what goes out: only what visitors can see', async () => {
    stub()
    await show()
    await expect.poll(() => textOf(updates())).toContain('Only what visitors can see goes out')
  })

  it('says when there are none yet, and when they could not be loaded', async () => {
    const api = stub()
    api.announcements.mockResolvedValueOnce(pageOf([]))
    const empty = await show()
    await expect.element(updates().getByText('Nothing yet. The next new app or video shows up here.')).toBeVisible()
    await empty.unmount()
    api.announcements.mockRejectedValueOnce(new ApiError('/api/updates/announcements', 500))
    await show()
    await expect.poll(() => textOf(updates().getByRole('alert'))).toContain("The update emails couldn't be loaded.")
  })
})

describe('Community: coffees', () => {
  it('lists them: who (a mail link when they gave an address), amount, message, when; other events named', async () => {
    stub()
    await show()
    const coffee = (name: string) => coffees().getByRole('row').filter({ hasText: name })
    await expect.element(coffee('Ada')).toBeVisible()
    await expect.element(coffee('Ada').getByRole('link', { name: 'Ada' })).toHaveAttribute('href', 'mailto:ada@example.com')
    expect(textOf(coffee('Ada'))).toContain('3.00 GBP')
    expect(textOf(coffee('Ada'))).toContain('Thanks!')
    expect(textOf(coffee('Bob'))).toContain('membership.started')
    expect(textOf(coffee('Bob'))).toContain('No message')
    expect(coffee('Bob').getByRole('link').query()).toBeNull()
    expect(textOf(coffees())).toContain('2 in all')
  })

  it('says when there are none yet, and when they could not be loaded', async () => {
    const api = stub()
    api.donations.mockResolvedValueOnce(pageOf([]))
    const empty = await show()
    await expect.element(coffees().getByText(/No coffees yet/)).toBeVisible()
    await empty.unmount()
    api.donations.mockRejectedValueOnce(new ApiError('/api/support/donations', 500))
    await show()
    await expect.poll(() => textOf(coffees().getByRole('alert'))).toContain("Coffees couldn't be loaded.")
  })
})

describe('Community: loading, visitors, accessibility', () => {
  it('shows placeholders while each list loads', async () => {
    const api = stub()
    api.subscribers.mockReturnValue(forever())
    api.announcements.mockReturnValue(forever())
    api.donations.mockReturnValue(forever())
    await show()
    await expect.poll(() => page.getByRole('status').all().map((s) => textOf(s))).toEqual(['Loading subscribers…', 'Loading the update emails…', 'Loading coffees…'])
  })

  it('sends visitors who open it home', async () => {
    stub()
    const view = await renderView(<CommunityPage />, { path: '/community' })
    await expect.poll(() => view.location()).toBe('/')
  })

  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      stub()
      await show(theme)
      await expect.element(row('ada@example.com')).toBeVisible()
      await expect.element(item('Space Game')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
