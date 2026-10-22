import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../../layout/theme'
import { api, ApiError, type ContactMessageDetails, type ContactReply } from '../../../services/api'
import { a11yViolations } from '../../../test/a11y'
import { stubApi } from '../../../test/api'
import { ADA, INBOX, pageOfMessages } from '../../../test/fixtures/contact'
import { ADMIN, forever, renderView, textOf } from '../../../test/render'
import { formatDateTime } from '../../../utils/formatDate'
import { MessagesInbox } from './MessagesInbox'
import { INBOX_REFRESH_MS } from './MessagesInbox.viewModel'

// The admin's inbox: conversations, the latest first, and one opened: every message, who wrote it, and the next answer.

let calls: {
  list: MockInstance<typeof api.contact.listMessages>
  get: MockInstance<typeof api.contact.getMessage>
  read: MockInstance<typeof api.contact.markAsRead>
  remove: MockInstance<typeof api.contact.deleteMessage>
  reply: MockInstance<typeof api.contact.reply>
}

beforeEach(() => {
  stubApi({ user: ADMIN })
  let ada: ContactMessageDetails = structuredClone(ADA)
  calls = {
    list: vi.spyOn(api.contact, 'listMessages').mockResolvedValue(pageOfMessages()),
    get: vi.spyOn(api.contact, 'getMessage').mockImplementation(async () => structuredClone(ada)),
    read: vi.spyOn(api.contact, 'markAsRead').mockResolvedValue(),
    remove: vi.spyOn(api.contact, 'deleteMessage').mockResolvedValue(),
    reply: vi.spyOn(api.contact, 'reply').mockImplementation(async (_, text) => {
      const reply: ContactReply = { id: 99, text, sentAt: '2026-10-22T09:30:00Z', fromVisitor: false }
      ada = { ...ada, replies: [...ada.replies, reply] }
      return reply
    }),
  }
})

const show = (theme?: 'dark' | 'light' | 'vice') => renderView(<MessagesInbox />, { user: ADMIN, theme })
const table = () => page.getByRole('region', { name: 'Messages table' })
const row = (name: string) => table().getByRole('row').filter({ hasText: name })
const dialog = () => page.getByRole('dialog', { name: /^Message from/ })
const conversation = () => dialog().getByRole('region', { name: /^(Conversation|Reply)$/ })
const answers = () => conversation().getByRole('listitem')
const open = async (name = 'Ada') => {
  await row(name).getByRole('button', { name }).click()
  await expect.poll(() => answers().elements().length).toBe(2)
}

describe('the inbox', () => {
  it('lists conversations, the latest first, with when the last message came and how many there are', async () => {
    await show()
    await expect.element(row('Ada')).toBeVisible()
    expect(
      table()
        .getByRole('columnheader')
        .elements()
        .map((th) => th.textContent),
    ).toEqual(['Status', 'Name', 'Last message', 'Actions'])
    expect(textOf(row('Ada'))).toContain(`${formatDateTime(INBOX[0].lastActivityAt)} · 3 messages`)
    // A conversation of one message doesn't count it.
    expect(textOf(row('Bob'))).not.toContain('messages')
    expect(textOf(row('Bob'))).toContain(formatDateTime(INBOX[1].lastActivityAt))
  })

  it('marks a conversation with something new as unread', async () => {
    await show()
    await expect.element(row('Ada')).toBeVisible()
    expect(row('Ada').getByText('Unread').query()).not.toBeNull()
    expect(row('Bob').getByText('Unread').query()).toBeNull()
  })

  it('says when there are none, and when they could not be loaded', async () => {
    calls.list.mockResolvedValueOnce(pageOfMessages([], 0))
    const empty = await show()
    await expect.element(page.getByText('No messages yet.')).toBeVisible()
    await empty.unmount()

    calls.list.mockRejectedValueOnce(new ApiError('/api/contact/messages', 500)).mockResolvedValue(pageOfMessages())
    await show()
    await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(row('Ada')).toBeVisible()
  })

  it('shows placeholders while it loads', async () => {
    calls.list.mockReturnValueOnce(forever())
    await show()
    await expect.element(page.getByRole('status')).toHaveTextContent('Loading messages…')
  })

  it('pages through more than 10', async () => {
    calls.list.mockImplementation(async (pageNumber = 1) => pageOfMessages(INBOX, 25, pageNumber))
    await show()
    const pager = page.getByRole('navigation', { name: 'Pagination' })
    await expect.poll(() => textOf(pager)).toContain('Page 1 of 3')
    await pager.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => calls.list.mock.calls.at(-1)?.[0]).toBe(2)
  })

  it('deletes a conversation after asking', async () => {
    await show()
    await row('Bob')
      .getByRole('button', { name: /Delete/ })
      .click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.poll(() => calls.remove.mock.calls).toEqual([[2]])
  })
})

describe('a conversation, opened', () => {
  it('shows their first message, then every message after it with who wrote it, oldest first', async () => {
    await show()
    await open()
    expect(textOf(dialog())).toContain(ADA.message)
    expect(conversation().getByRole('heading').element().textContent).toBe('Conversation')
    const shown = answers()
      .elements()
      .map((li) => [li.querySelector('strong')!.textContent, li.querySelector('.message-body')!.textContent, li.classList.contains('reply-from-visitor')])
    expect(shown).toEqual([
      ['You', 'Thanks Ada! Happy to. When suits you?', false],
      ['Ada', 'Tuesday at 10?', true],
    ])
    expect(textOf(answers().nth(1))).toContain(formatDateTime('2026-10-22T08:30:00Z'))
  })

  it("shows the email's subject when the conversation started by email, and none for the form", async () => {
    calls.get.mockResolvedValueOnce({ ...structuredClone(ADA), subject: 'A question about the beam' })
    const first = await show()
    await open()
    const subject = dialog().getByRole('term').filter({ hasText: 'Subject' })
    await expect.element(subject).toBeVisible()
    expect(textOf(dialog())).toContain('A question about the beam')
    await first.unmount()

    await show()
    await open()
    expect(dialog().getByRole('term').filter({ hasText: 'Subject' }).query()).toBeNull()
  })

  it('marks it read once it is open', async () => {
    await show()
    await open()
    await expect.poll(() => calls.read.mock.calls).toEqual([[1]])
  })

  it('sends the next answer, which joins the conversation, and says where it goes', async () => {
    await show()
    await open()
    const box = conversation().getByRole('textbox', { name: 'Write to Ada again' })
    await expect.element(box).toHaveAccessibleDescription('Emailed to them: their answer lands here.')

    await box.fill('  Tuesday it is.  ')
    await conversation().getByRole('button', { name: 'Send reply' }).click()

    await expect.poll(() => answers().elements().length).toBe(3)
    expect(calls.reply).toHaveBeenCalledWith(1, 'Tuesday it is.')
    expect(textOf(answers().last())).toContain('You')
    expect(textOf(answers().last())).toContain('Tuesday it is.')
    await expect.element(box).toHaveValue('')
  })

  it('offers "Reply" before anyone has answered', async () => {
    calls.get.mockResolvedValueOnce({ ...structuredClone(ADA), replies: [] })
    await show()
    await row('Ada').getByRole('button', { name: 'Ada' }).click()
    await expect.element(dialog().getByRole('heading', { name: 'Reply', exact: true })).toBeVisible()
    await expect.element(dialog().getByRole('textbox', { name: 'Reply to Ada' })).toBeVisible()
    expect(dialog().getByRole('listitem').query()).toBeNull()
  })

  it("says why an answer couldn't go, and keeps it to try again", async () => {
    calls.reply.mockRejectedValueOnce(new ApiError('/api/contact/messages/1/reply', 503)).mockRejectedValueOnce(new ApiError('/api/contact/messages/1/reply', 500))
    await show()
    await open()
    const box = conversation().getByRole('textbox', { name: 'Write to Ada again' })
    await box.fill('Hello')
    await conversation().getByRole('button', { name: 'Send reply' }).click()
    await expect.element(conversation().getByRole('alert')).toHaveTextContent("The email couldn't be sent: check Resend in Settings (its test shows why).")
    await conversation().getByRole('button', { name: 'Send reply' }).click()
    await expect.element(conversation().getByRole('alert')).toHaveTextContent("That didn't work. Please try again.")
    await expect.element(box).toHaveValue('Hello')
    expect(answers().elements()).toHaveLength(2)
  })

  it('needs words before sending', async () => {
    await show()
    await open()
    await conversation().getByRole('button', { name: 'Send reply' }).click()
    await expect.element(conversation().getByRole('alert')).toHaveTextContent('Write the reply first.')
    expect(calls.reply).not.toHaveBeenCalled()
  })
})

describe('emails that come in while it is open', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('the inbox looks again every minute, so a new email shows up on top', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await show()
    await expect.element(row('Ada')).toBeVisible()
    const grace = { id: 3, name: 'Grace', receivedAt: '2026-10-22T09:00:00Z', isRead: false, lastActivityAt: '2026-10-22T09:00:00Z', count: 1 }
    calls.list.mockResolvedValue(pageOfMessages([grace, ...INBOX]))

    await vi.advanceTimersByTimeAsync(INBOX_REFRESH_MS)
    vi.useRealTimers()

    await expect.element(row('Grace')).toBeVisible()
    expect(table().getByRole('row').elements()[1].textContent).toContain('Grace')
  })

  it('an open conversation shows their answer when it comes, and is marked read again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await show()
    await open()
    const reply: ContactReply = { id: 12, text: 'Or Wednesday?', sentAt: '2026-10-22T09:45:00Z', fromVisitor: true }
    calls.get.mockResolvedValue({ ...structuredClone(ADA), readAt: null, replies: [...ADA.replies, reply] })

    await vi.advanceTimersByTimeAsync(INBOX_REFRESH_MS)
    vi.useRealTimers()

    await expect.poll(() => answers().elements().length).toBe(3)
    expect(textOf(answers().last())).toContain('Or Wednesday?')
    await expect.poll(() => calls.read.mock.calls.length).toBe(2)
  })

  it('after an answer is sent, the inbox loads again: the conversation moves up with one more message', async () => {
    await show()
    await open()
    const before = calls.list.mock.calls.length

    await conversation().getByRole('textbox', { name: 'Write to Ada again' }).fill('Tuesday it is.')
    await conversation().getByRole('button', { name: 'Send reply' }).click()

    await expect.poll(() => calls.list.mock.calls.length).toBeGreaterThan(before)
  })

  it("doesn't load the inbox again when the answer couldn't be sent", async () => {
    calls.reply.mockRejectedValueOnce(new ApiError('/api/contact/messages/1/reply', 503))
    await show()
    await open()
    const before = calls.list.mock.calls.length

    await conversation().getByRole('textbox', { name: 'Write to Ada again' }).fill('Hello')
    await conversation().getByRole('button', { name: 'Send reply' }).click()
    await expect.element(conversation().getByRole('alert')).toBeVisible()

    expect(calls.list.mock.calls.length).toBe(before)
  })
})

describe('accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems, with a conversation open`, async () => {
      await show(theme)
      await open()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
