import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { Meeting } from '../../services/api'
import { renderApp } from '../../test/render'
import { API, inbox, makeMessages, server, signedIn } from '../../test/server'

afterEach(() => {
  delete window.Cal
  document.querySelectorAll('script[src*="cal.com"]').forEach((s) => s.remove())
})

/** A meeting today at 15:00 (local), lasting half an hour. */
function meeting(patch: Partial<Meeting> = {}): Meeting {
  const start = new Date()
  start.setHours(15, 0, 0, 0)
  return {
    id: 7,
    title: '30 min with Claudiu',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 30 * 60_000).toISOString(),
    attendeeName: 'Grace',
    attendeeEmail: 'grace@example.com',
    attendeeTimeZone: 'Europe/London',
    notes: 'About an app',
    status: 'requested',
    ...patch,
  }
}

describe('booking a meeting (visitors)', () => {
  it('is offered next to the contact form once a Cal.com page is set, and loads it', async () => {
    server.use(http.get(`${API}/api/meetings/info`, () => HttpResponse.json({ calLink: 'claomike/30min' })))
    const user = userEvent.setup()
    renderApp('/contact')

    await user.click(await screen.findByLabelText('Book a meeting'))

    expect(screen.getByRole('region', { name: 'Book a meeting with Claudiu (Cal.com)' })).toBeInTheDocument()
    expect(document.querySelector('script[src="https://app.cal.com/embed/embed.js"]')).not.toBeNull()
    // Queued for Cal.com's script: the inline calendar of this booking page.
    expect(JSON.stringify((window.Cal!.ns.jechel as unknown as { q: unknown[] }).q)).toContain('"calLink":"claomike/30min"')

    await user.click(screen.getByLabelText('Send a message'))
    expect(screen.getByLabelText('Message')).toBeInTheDocument()
  })

  it("isn't offered without a Cal.com page", async () => {
    renderApp('/contact')

    expect(await screen.findByLabelText('Message')).toBeInTheDocument()
    expect(screen.queryByLabelText('Book a meeting')).not.toBeInTheDocument()
  })
})

describe('the meetings calendar (admin)', () => {
  function renderCalendar(meetings: Meeting[]) {
    const api = inbox(makeMessages(1))
    server.use(signedIn(), ...api.handlers, http.get(`${API}/api/meetings`, () => HttpResponse.json(meetings)))
    renderApp('/contact')
    return { user: userEvent.setup(), calls: api.calls }
  }

  it("marks the month's days and lists today's meetings above the messages", async () => {
    renderCalendar([meeting(), meeting({ id: 8, attendeeName: 'Linus', notes: null, status: 'accepted' })])

    expect(await screen.findByText('1 request is waiting for you this month.')).toBeInTheDocument()
    const today = within(screen.getByRole('grid')).getByRole('button', { pressed: true })
    expect(today).toHaveAccessibleName(/2 meetings$/)
    expect(screen.getByText('Grace')).toBeInTheDocument()
    expect(screen.getByText('“About an app”')).toBeInTheDocument()
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0)
    // The calendar comes before the messages.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.indexOf('Meetings')).toBeLessThan(headings.indexOf('Messages'))
  })

  it('accepts a request with a message for them', async () => {
    const { user, calls } = renderCalendar([meeting()])

    await user.type(await screen.findByLabelText('Message to Grace (optional)'), 'See you then!')
    await user.click(screen.getByRole('button', { name: 'Accept' }))

    expect(await screen.findByText('Your message was emailed to them.')).toBeInTheDocument()
    expect(calls.decisions).toEqual([{ id: 7, decision: 'accept', message: 'See you then!' }])
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  })

  it('says when Cal.com refuses', async () => {
    const { user } = renderCalendar([meeting()])
    server.use(http.post(`${API}/api/meetings/:id/:decision`, () => new HttpResponse(null, { status: 502 })))

    await user.click(await screen.findByRole('button', { name: 'Decline' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Cal.com didn't take it")
  })
})

describe('replying to a message (admin)', () => {
  it('emails the reply and lists it; a meeting they booked can be decided there too', async () => {
    const messages = makeMessages(1)
    messages[0].meetings = [meeting()]
    const api = inbox(messages)
    server.use(signedIn(), ...api.handlers)
    const user = userEvent.setup()
    renderApp('/contact')

    await user.click(await screen.findByRole('button', { name: 'Sender 1' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByRole('region', { name: 'Meetings they booked' })).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Send reply' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('Write the reply first.')

    await user.type(dialog.getByLabelText('Reply to Sender 1'), 'Thanks, happy to help.')
    await user.click(dialog.getByRole('button', { name: 'Send reply' }))

    await waitFor(() => expect(api.calls.replies).toEqual([{ id: 1, text: 'Thanks, happy to help.' }]))
    expect(await dialog.findByRole('heading', { name: 'Your replies' })).toBeInTheDocument()
    expect(dialog.getByText('Thanks, happy to help.')).toBeInTheDocument()
  })
})
