import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { stubApi } from '@/test/api'
import { todayAt, todaysMeetings } from '@/test/fixtures/meetings'
import { ADMIN, forever, renderView, textOf } from '@/test/render'
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

describe('cancelling', () => {
  let cancel: MockInstance<typeof api.meetings.cancel>

  // Today: Bob's accepted meeting is still to come (until 23:59); Cy's ended just after midnight.
  beforeEach(() => {
    const [bob, ada] = todaysMeetings()
    list.mockImplementation(async () => [
      { ...bob, id: 4, attendeeName: 'Cy', attendeeEmail: 'cy@example.com', startTime: todayAt(0, 0), endTime: todayAt(0, 1) },
      { ...bob, startTime: todayAt(23, 0), endTime: todayAt(23, 59) },
      ada,
    ])
    cancel = vi.spyOn(api.meetings, 'cancel').mockResolvedValue({ status: 'cancelled', emailSent: true })
  })
  const dialog = () => page.getByRole('dialog', { name: 'Cancel the meeting with Bob?' })

  it('cancels an accepted meeting after asking, with an optional reason for Cal.com to email them', async () => {
    await show()
    await meeting('Bob').getByRole('button', { name: 'Cancel meeting' }).click()
    await expect.element(dialog()).toBeVisible()
    expect(textOf(dialog())).toContain("Cal.com emails Bob that it's cancelled")
    await dialog().getByRole('textbox', { name: 'Reason (optional)' }).fill('  Something came up, sorry.  ')
    await dialog().getByRole('button', { name: 'Cancel meeting' }).click()

    await expect.element(dialog()).not.toBeInTheDocument()
    expect(cancel).toHaveBeenCalledWith(3, 'Something came up, sorry.')
    await expect.element(meeting('Bob').getByText('Cancelled')).toBeVisible()
    expect(textOf(meeting('Bob'))).toContain('Cal.com emailed them.')
    expect(meeting('Bob').getByRole('button', { name: 'Cancel meeting' }).query()).toBeNull()
  })

  it('"Keep it" closes the question and cancels nothing', async () => {
    await show()
    await meeting('Bob').getByRole('button', { name: 'Cancel meeting' }).click()
    await dialog().getByRole('button', { name: 'Keep it' }).click()

    await expect.element(dialog()).not.toBeInTheDocument()
    expect(cancel).not.toHaveBeenCalled()
    await expect.element(meeting('Bob').getByText('Accepted')).toBeVisible()
  })

  it("says so when Cal.com won't, keeping the question open and the meeting on", async () => {
    cancel.mockRejectedValueOnce(new ApiError('/api/meetings/3/cancel', 502))
    await show()
    await meeting('Bob').getByRole('button', { name: 'Cancel meeting' }).click()
    await dialog().getByRole('button', { name: 'Cancel meeting' }).click()

    await expect.element(dialog().getByRole('alert')).toHaveTextContent("Cal.com didn't take it. Check the API key in Settings, then try again.")
    await expect.element(meeting('Bob').getByText('Accepted')).toBeVisible()
  })

  it('says when it ended meanwhile, or anything else failed; asking again starts afresh', async () => {
    cancel.mockRejectedValueOnce(new ApiError('/api/meetings/3/cancel', 400)).mockRejectedValueOnce(new ApiError('/api/meetings/3/cancel', 500))
    await show()
    await meeting('Bob').getByRole('button', { name: 'Cancel meeting' }).click()
    await dialog().getByRole('button', { name: 'Cancel meeting' }).click()
    await expect.element(dialog().getByRole('alert')).toHaveTextContent('It has ended already: there is nothing to cancel.')

    await dialog().getByRole('button', { name: 'Cancel meeting' }).click()
    await expect.element(dialog().getByRole('alert')).toHaveTextContent("That didn't work. Please try again.")
    await dialog().getByRole('button', { name: 'Keep it' }).click()
    await meeting('Bob').getByRole('button', { name: 'Cancel meeting' }).click()
    expect(dialog().getByRole('alert').query()).toBeNull()
  })

  it('offers it only for an accepted meeting that is still to come: not one that ended, nor a request', async () => {
    await show()
    await expect.element(meeting('Bob').getByRole('button', { name: 'Cancel meeting' })).toBeVisible()
    expect(meeting('Cy').getByRole('button', { name: 'Cancel meeting' }).query()).toBeNull()
    expect(meeting('Ada').getByRole('button', { name: 'Cancel meeting' }).query()).toBeNull()
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
