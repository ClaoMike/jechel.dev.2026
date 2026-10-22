import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../../layout/theme'
import { api, ApiError } from '../../../services/api'
import { a11yViolations } from '../../../test/a11y'
import { stubApi } from '../../../test/api'
import { todaysMeetings } from '../../../test/fixtures/meetings'
import { ADMIN, forever, renderView, textOf } from '../../../test/render'
import { MeetingsCalendar } from './MeetingsCalendar'

// The admin's meetings, by invitation: a month, today's meetings, requests to accept or decline, and who never wrote.

let list: MockInstance<typeof api.meetings.list>
let decide: MockInstance<typeof api.meetings.decide>

beforeEach(() => {
  list = stubApi({ user: ADMIN }).meetings.list.mockImplementation(async () => todaysMeetings())
  decide = vi.spyOn(api.meetings, 'decide').mockImplementation(async (_, accept) => ({ status: accept ? 'accepted' : 'declined', emailSent: true }))
})

const show = (theme?: 'dark' | 'light' | 'vice') => renderView(<MeetingsCalendar />, { user: ADMIN, theme })
const card = () => page.getByRole('region', { name: 'Meetings' })
const meeting = (name: string) => card().getByRole('listitem').filter({ hasText: name })

describe('the month', () => {
  it("shows this month, how many requests wait, and today's meetings, soonest first", async () => {
    await show()
    await expect.element(meeting('Ada')).toBeVisible()
    expect(textOf(card())).toContain(new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date()))
    await expect.element(card().getByRole('status')).toHaveTextContent('2 requests are waiting for you this month.')
    expect(
      card()
        .getByRole('listitem')
        .elements()
        .map((li) => li.querySelector('strong')!.textContent),
    ).toEqual(['Bob', 'Ada', 'Mallory'])
    expect(textOf(meeting('Ada'))).toContain('“About a website”')
  })

  it('marks the day that has meetings, and says how many', async () => {
    await show()
    const today = card().getByRole('button', { name: /, 3 meetings$/ })
    await expect.element(today).toBeVisible()
    await expect.element(today).toHaveAttribute('aria-pressed', 'true')
    expect(today.element().querySelectorAll('.calendar-dot')).toHaveLength(3)
  })

  it('a day with none says so', async () => {
    await show()
    await expect.element(meeting('Ada')).toBeVisible()
    const other = card()
      .getByRole('button')
      .elements()
      .find((b) => b.classList.contains('calendar-day') && !b.getAttribute('aria-label')!.includes('meeting')) as HTMLButtonElement
    other.click()
    await expect.element(card().getByText('No meetings this day.')).toBeVisible()
  })

  it('asks for the next and the previous month', async () => {
    await show()
    await expect.element(meeting('Ada')).toBeVisible()
    const first = list.mock.calls[0][0]

    await card().getByRole('button', { name: 'Next month' }).click()
    await expect.poll(() => list.mock.calls.length).toBe(2)
    expect(list.mock.calls[1][0].getTime()).toBeGreaterThan(first.getTime())

    await card().getByRole('button', { name: 'Previous month' }).click()
    await card().getByRole('button', { name: 'Previous month' }).click()
    await expect.poll(() => list.mock.calls.length).toBe(3)
    expect(list.mock.calls[2][0].getTime()).toBeLessThan(first.getTime())
  })

  it('shows placeholders while loading, and offers to try again when it fails', async () => {
    list.mockReturnValueOnce(forever())
    const loading = await show()
    await expect.element(card().getByRole('status')).toHaveTextContent('Loading meetings…')
    await loading.unmount()

    list.mockRejectedValueOnce(new ApiError('/api/meetings', 500))
    await show()
    await expect.element(card().getByText("Meetings couldn't be loaded.")).toBeVisible()
    await card().getByRole('button', { name: 'Try again' }).click()
    await expect.element(meeting('Ada')).toBeVisible()
  })
})

describe('by invitation', () => {
  it('marks a request from someone who never wrote, and only theirs', async () => {
    await show()
    await expect.element(meeting('Mallory').getByText('Not from a conversation')).toBeVisible()
    expect(meeting('Ada').getByText('Not from a conversation').query()).toBeNull()
    expect(meeting('Bob').getByText('Not from a conversation').query()).toBeNull()
  })

  it('an older API that says nothing about it marks no one', async () => {
    list.mockResolvedValue(todaysMeetings().map((m) => ({ ...m, fromConversation: undefined })))
    await show()
    await expect.element(meeting('Mallory')).toBeVisible()
    expect(card().getByText('Not from a conversation').query()).toBeNull()
  })
})

describe('deciding', () => {
  it('accepts with a message, which is emailed, and the request stops waiting', async () => {
    await show()
    await meeting('Ada').getByRole('textbox', { name: 'Message to Ada (optional)' }).fill('  See you then!  ')
    await meeting('Ada').getByRole('button', { name: 'Accept' }).click()

    expect(decide).toHaveBeenCalledWith(1, true, 'See you then!')
    await expect.element(meeting('Ada').getByText('Accepted')).toBeVisible()
    expect(textOf(meeting('Ada'))).toContain('Your message was emailed to them.')
    await expect.element(card().getByRole('status')).toHaveTextContent('1 request is waiting for you this month.')
  })

  it("declines a stranger's request in one go, with no message", async () => {
    await show()
    await meeting('Mallory').getByRole('button', { name: 'Decline' }).click()

    expect(decide).toHaveBeenCalledWith(2, false, '')
    await expect.element(meeting('Mallory').getByText('Declined')).toBeVisible()
    expect(textOf(meeting('Mallory'))).not.toContain('emailed')
  })

  it("says when the message couldn't be emailed, though Cal.com was told", async () => {
    decide.mockResolvedValueOnce({ status: 'accepted', emailSent: false })
    await show()
    await meeting('Ada').getByRole('textbox', { name: 'Message to Ada (optional)' }).fill('Hi')
    await meeting('Ada').getByRole('button', { name: 'Accept' }).click()

    await expect.element(meeting('Ada').getByText("Your message couldn't be emailed; Cal.com still told them.")).toBeVisible()
  })

  it("says why it didn't work, and keeps the request", async () => {
    decide.mockRejectedValueOnce(new ApiError('/api/meetings/1/accept', 502)).mockRejectedValueOnce(new ApiError('/api/meetings/1/accept', 500))
    await show()
    await meeting('Ada').getByRole('button', { name: 'Accept' }).click()
    await expect.element(meeting('Ada').getByRole('alert')).toHaveTextContent("Cal.com didn't take it. Check the API key in Settings, then try again.")

    await meeting('Ada').getByRole('button', { name: 'Accept' }).click()
    await expect.element(meeting('Ada').getByRole('alert')).toHaveTextContent("That didn't work. Please try again.")
    await expect.element(meeting('Ada').getByRole('button', { name: 'Accept' })).toBeEnabled()
  })

  it('disables both buttons while deciding', async () => {
    decide.mockReturnValueOnce(forever())
    await show()
    await meeting('Ada').getByRole('button', { name: 'Accept' }).click()

    await expect.element(meeting('Ada').getByRole('button', { name: 'Accepting…' })).toBeDisabled()
    await expect.element(meeting('Ada').getByRole('button', { name: 'Decline' })).toBeDisabled()
  })
})

describe('accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      await show(theme)
      await expect.element(meeting('Mallory')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
