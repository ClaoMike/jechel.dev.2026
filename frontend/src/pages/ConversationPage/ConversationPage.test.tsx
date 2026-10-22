import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { api, ApiError, type Conversation } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { ADA_CONVERSATION, CONVERSATION_TOKEN } from '../../test/fixtures/contact'
import { SITE } from '../../test/fixtures/site'
import { forever, renderApp, textOf } from '../../test/render'
import { formatDateTime } from '../../utils/formatDate'
import { tracker } from '../../features/analytics/tracker'

// The visitor's conversation, opened from "Reply on jechel.dev" in an answer's email: every message, and a box to write back.

const path = `/contact/conversation?token=${CONVERSATION_TOKEN}`

function stub(conversation: Conversation = ADA_CONVERSATION) {
  const stubs = stubApi()
  let current = structuredClone(conversation)
  const get = vi.spyOn(api.contact, 'getConversation').mockImplementation(async () => structuredClone(current))
  const writeBack = vi.spyOn(api.contact, 'writeBack').mockImplementation(async (_, text) => {
    current = { ...current, messages: [...current.messages, { text, at: '2026-10-22T09:00:00Z', fromVisitor: true }] }
    return structuredClone(current)
  })
  return { ...stubs, get, writeBack }
}

const card = () => page.getByRole('region', { name: 'Your conversation with Claudiu' })
const messages = () => card().getByRole('list', { name: 'Messages, oldest first' }).getByRole('listitem')
const box = () => card().getByRole('textbox', { name: 'Write back' })
const send = () => card().getByRole('button', { name: 'Send' })

describe('the conversation', () => {
  it('shows every message, oldest first, theirs as "You" and the answers as Claudiu, each with its time', async () => {
    const stubs = stub()
    await renderApp({ path })
    await expect.poll(() => messages().elements().length).toBe(3)
    expect(stubs.get).toHaveBeenCalledWith(CONVERSATION_TOKEN, expect.anything())
    const shown = messages()
      .elements()
      .map((li) => [li.getAttribute('data-from'), li.querySelector('strong')!.textContent, li.querySelector('.message-body')!.textContent])
    expect(shown).toEqual([
      ['visitor', 'You', ADA_CONVERSATION.messages[0].text],
      ['admin', 'Claudiu', 'Thanks Ada! Happy to. When suits you?'],
      ['visitor', 'You', 'Tuesday at 10?'],
    ])
    expect(textOf(messages().nth(1))).toContain(formatDateTime('2026-10-21T10:00:00Z'))
  })

  it('writes back: the message joins the conversation and the box empties', async () => {
    const stubs = stub()
    const reported = vi.spyOn(tracker, 'event')
    await renderApp({ path })
    await box().fill('  Tuesday works. See you then!  ')
    await send().click()

    await expect.poll(() => messages().elements().length).toBe(4)
    expect(stubs.writeBack).toHaveBeenCalledWith(CONVERSATION_TOKEN, 'Tuesday works. See you then!')
    expect(textOf(messages().last())).toContain('Tuesday works. See you then!')
    await expect.element(box()).toHaveValue('')
    await expect.element(card().getByRole('status')).toHaveTextContent("Sent. You'll get an email when Claudiu answers.")
    expect(reported).toHaveBeenCalledWith('Wrote back in a conversation', undefined)
    // Never what they wrote.
    expect(JSON.stringify(reported.mock.calls)).not.toContain('Tuesday')
  })

  it('keeps the line breaks they type', async () => {
    stub()
    await renderApp({ path })
    await box().fill('Line one\nLine two')
    await send().click()
    await expect.poll(() => messages().elements().length).toBe(4)
    const body = messages().last().element().querySelector('.message-body') as HTMLElement
    expect(body.textContent).toBe('Line one\nLine two')
    expect(getComputedStyle(body).whiteSpace).toBe('pre-wrap')
  })

  it('needs some words, and says so next to the box without asking the API', async () => {
    const stubs = stub()
    await renderApp({ path })
    await box().fill('   ')
    await send().click()
    await expect.element(box()).toHaveAccessibleDescription('Write your message first.')
    await expect.element(box()).toHaveAttribute('aria-invalid', 'true')
    expect(stubs.writeBack).not.toHaveBeenCalled()

    await box().fill('Now with words')
    await expect.element(box()).not.toHaveAttribute('aria-invalid')
  })

  it('stops at 2000 characters, as the API does', async () => {
    stub()
    await renderApp({ path })
    await expect.element(box()).toHaveAttribute('maxlength', '2000')
  })

  it('says what went wrong, and keeps what was written to try again', async () => {
    const stubs = stub()
    stubs.writeBack
      .mockRejectedValueOnce(new ApiError('/api/contact/conversations/x/messages', 429))
      .mockRejectedValueOnce(new ApiError('/api/contact/conversations/x/messages', 400, { text: ['At most 2000 characters.'] }))
      .mockRejectedValueOnce(new ApiError('/api/contact/conversations/x/messages', 404))
      .mockRejectedValueOnce(new ApiError('/api/contact/conversations/x/messages', 500))
    await renderApp({ path })
    await box().fill('Hello again')
    for (const expected of [
      'Too many messages in a short while. Please try again in a few minutes.',
      'At most 2000 characters.',
      "This conversation isn't there any more.",
      "That didn't work. Please try again.",
    ]) {
      await send().click()
      await expect.element(card().getByRole('alert')).toHaveTextContent(expected)
      await expect.element(box()).toHaveValue('Hello again')
    }
  })

  it('waits while sending, and a second press sends nothing more', async () => {
    const stubs = stub()
    let finish!: (conversation: Conversation) => void
    stubs.writeBack.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    await renderApp({ path })
    await box().fill('One message')
    await send().click()
    await expect.element(card().getByRole('button', { name: 'Sending…' })).toBeDisabled()
    await userEvent.keyboard('{Enter}')
    finish({ ...ADA_CONVERSATION, messages: [...ADA_CONVERSATION.messages, { text: 'One message', at: '2026-10-22T09:00:00Z', fromVisitor: true }] })
    await expect.poll(() => messages().elements().length).toBe(4)
    expect(stubs.writeBack).toHaveBeenCalledOnce()
  })
})

describe('the link', () => {
  it("says a link that matches no conversation isn't valid, and points to the Contact page", async () => {
    const stubs = stub()
    stubs.get.mockRejectedValueOnce(new ApiError('/api/contact/conversations/x', 404))
    await renderApp({ path })
    await expect.element(card().getByRole('alert')).toHaveTextContent("This link isn't valid any more. Write again from the Contact page.")
    await expect.element(card().getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
    expect(box().query()).toBeNull()
  })

  it('says the same for a link without its code, without asking the API', async () => {
    const stubs = stub()
    await renderApp({ path: '/contact/conversation' })
    await expect.element(card().getByRole('alert')).toBeVisible()
    expect(stubs.get).not.toHaveBeenCalled()
  })

  it('shows it loading, and a retry when it fails another way', async () => {
    const stubs = stub()
    stubs.get.mockReturnValueOnce(forever())
    const loading = await renderApp({ path })
    await expect.element(card().getByRole('status')).toHaveTextContent('Loading the conversation…')
    await loading.unmount()

    stubs.get.mockRejectedValueOnce(new ApiError('/api/contact/conversations/x', 500))
    await renderApp({ path })
    await expect.element(card().getByText("The conversation couldn't be loaded.")).toBeVisible()
    await card().getByRole('button', { name: 'Try again' }).click()
    await expect.poll(() => messages().elements().length).toBe(3)
  })

  it('works while the Contact page is hidden from visitors, and during maintenance', async () => {
    const stubs = stub()
    stubs.site.status.mockResolvedValue({ ...structuredClone(SITE), pages: { ...SITE.pages, contact: false }, maintenance: true, maintenanceMessage: 'Back at 18:00' })
    await renderApp({ path })
    await expect.poll(() => messages().elements().length).toBe(3)
    await expect.element(box()).toBeVisible()
    expect(document.body.textContent).not.toContain('Back at 18:00')
  })

  it("shows the visitor's name nowhere but in what they wrote, and never their address", async () => {
    stub()
    await renderApp({ path })
    await expect.poll(() => messages().elements().length).toBe(3)
    expect(card().element().textContent).not.toContain('@')
  })
})

describe('accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      stub()
      await renderApp({ path, theme })
      await expect.poll(() => messages().elements().length).toBe(3)
      expect(await a11yViolations()).toEqual([])
    })
  }
})
