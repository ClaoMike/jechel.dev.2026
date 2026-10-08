import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/render'
import { API, inbox, makeMessages, server, signedIn, type TestMessage } from '../../test/server'
import { formatDateTime } from '../../utils/formatDate'

async function renderInbox(messages: TestMessage[], url = '/contact') {
  const user = userEvent.setup()
  const api = inbox(messages)
  server.use(signedIn(), ...api.handlers)
  renderApp(url)
  await screen.findByRole('heading', { name: 'Messages' })
  await waitFor(() => expect(screen.queryByText('Loading messages…')).not.toBeInTheDocument())
  return { user, calls: api.calls }
}

const rows = async () => within(await screen.findByRole('table')).getAllByRole('row').slice(1) // minus the header
const rowFor = (name: string) => screen.getByRole('button', { name }).closest('tr')!
const isUnread = (name: string) => within(rowFor(name)).queryByText('Unread') !== null

describe('MessagesInbox', () => {
  it('replaces the contact form for the signed-in admin', async () => {
    await renderInbox(makeMessages(3))

    expect(screen.queryByRole('heading', { name: 'Contact me' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
  })

  it('lists messages in a table: name, date received, and a dot when unread', async () => {
    const messages = makeMessages(3)
    await renderInbox(messages)

    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Status', 'Name', 'Date received'])

    const [first, , third] = await rows()
    expect(within(first).getByRole('button', { name: 'Sender 1' })).toBeInTheDocument()
    expect(within(first).getByText(formatDateTime(messages[0].receivedAt))).toHaveAttribute('dateTime', messages[0].receivedAt)
    expect(isUnread('Sender 1')).toBe(true)
    expect(isUnread('Sender 2')).toBe(true)
    expect(within(third).queryByText('Unread')).not.toBeInTheDocument() // every third one is read
    expect(screen.getByText('3 messages')).toBeInTheDocument()
  })

  it('pages through messages 10 at a time', async () => {
    const { user } = await renderInbox(makeMessages(23))

    expect(await rows()).toHaveLength(10)
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sender 11' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument()
    expect(await rows()).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('opens on the page in the URL', async () => {
    await renderInbox(makeMessages(23), '/contact?page=3')
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument()
  })

  it('falls back to the last page for a page past the end', async () => {
    await renderInbox(makeMessages(12), '/contact?page=9')
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sender 12' })).toBeInTheDocument()
  })

  it('hides pagination when everything fits on one page', async () => {
    await renderInbox(makeMessages(4))
    await rows()

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })

  it('says when there are no messages', async () => {
    await renderInbox([])

    expect(await screen.findByText('No messages yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says when messages could not be loaded', async () => {
    server.use(signedIn(), http.get(`${API}/api/contact/messages`, () => new HttpResponse(null, { status: 500 })))
    renderApp('/contact')

    expect(await screen.findByText(/couldn't be loaded/)).toBeInTheDocument()
  })

  it('opens a popup with every detail, and marks the message as read', async () => {
    const messages = makeMessages(2)
    const { user, calls } = await renderInbox(messages)
    expect(isUnread('Sender 1')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Sender 1' }))

    const dialog = await screen.findByRole('dialog', { name: 'Message from Sender 1' })
    expect(await within(dialog).findByText('sender1@example.com')).toHaveAttribute('href', 'mailto:sender1@example.com')
    expect(within(dialog).getByText(messages[0].message)).toBeInTheDocument()
    expect(within(dialog).getByText(formatDateTime(messages[0].receivedAt))).toBeInTheDocument()

    await waitFor(() => expect(isUnread('Sender 1')).toBe(false))
    expect(calls.markAsRead).toEqual([1])
    expect(isUnread('Sender 2')).toBe(true)
  })

  it('opens a message when its row is clicked anywhere', async () => {
    const messages = makeMessages(1)
    const { user } = await renderInbox(messages)

    await user.click(screen.getByText(formatDateTime(messages[0].receivedAt)))

    expect(await screen.findByRole('dialog', { name: 'Message from Sender 1' })).toBeInTheDocument()
  })

  it('does not mark an already-read message again', async () => {
    const { user, calls } = await renderInbox(makeMessages(3))

    await user.click(screen.getByRole('button', { name: 'Sender 3' }))
    await within(await screen.findByRole('dialog')).findByText('sender3@example.com')

    expect(calls.markAsRead).toEqual([])
  })

  it('has a copy button for every field', async () => {
    const messages = makeMessages(1)
    const { user } = await renderInbox(messages)
    await user.click(screen.getByRole('button', { name: 'Sender 1' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('sender1@example.com')

    const copies: Array<[string, string]> = [
      ['Copy name', 'Sender 1'],
      ['Copy email', 'sender1@example.com'],
      ['Copy received', formatDateTime(messages[0].receivedAt)],
      ['Copy message', messages[0].message],
    ]
    for (const [button, value] of copies) {
      await user.click(within(dialog).getByRole('button', { name: button }))
      await expect(navigator.clipboard.readText()).resolves.toBe(value)
    }
    expect(within(dialog).getByRole('button', { name: 'Copy message' })).toHaveAttribute('title', 'Copied!')
  })

  it('closes with Escape, the close button, or a backdrop click, and returns focus to the message', async () => {
    const { user } = await renderInbox(makeMessages(1))
    const open = async () => {
      await user.click(screen.getByRole('button', { name: 'Sender 1' }))
      return screen.findByRole('dialog')
    }

    await open()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sender 1' })).toHaveFocus()

    const dialog = await open()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await open()
    await user.click(document.querySelector('.modal-backdrop')!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps keyboard focus inside the popup', async () => {
    const { user } = await renderInbox(makeMessages(1))
    await user.click(screen.getByRole('button', { name: 'Sender 1' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('sender1@example.com')

    for (let i = 0; i < 12; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('shows an error in the popup when the message cannot be loaded', async () => {
    const { user, calls } = await renderInbox(makeMessages(1))
    server.use(http.get(`${API}/api/contact/messages/:id`, () => new HttpResponse(null, { status: 500 })))

    await user.click(screen.getByRole('button', { name: 'Sender 1' }))

    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent(/couldn't be loaded/)
    expect(calls.markAsRead).toEqual([])
    expect(isUnread('Sender 1')).toBe(true)
  })

  it('still shows the message, unread in the list, when marking it as read fails', async () => {
    const { user } = await renderInbox(makeMessages(1))
    server.use(http.post(`${API}/api/contact/messages/:id/read`, () => new HttpResponse(null, { status: 500 })))

    await user.click(screen.getByRole('button', { name: 'Sender 1' }))

    expect(await within(await screen.findByRole('dialog')).findByText('sender1@example.com')).toBeInTheDocument()
    expect(isUnread('Sender 1')).toBe(true)
  })
})
