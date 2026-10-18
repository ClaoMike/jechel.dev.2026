import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Subscriber } from '../services/api'
import { renderApp } from '../test/render'
import { API, server, signedIn } from '../test/server'

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 20, totalCount: items.length })

function communityApi() {
  let subscribers: Subscriber[] = [
    { id: 1, email: 'ada@example.com', createdAt: '2026-10-01T10:00:00Z', confirmedAt: '2026-10-01T10:05:00Z' },
    { id: 2, email: 'bob@example.com', createdAt: '2026-10-02T10:00:00Z', confirmedAt: null },
  ]
  return [
    http.get(`${API}/api/updates/subscribers`, () => HttpResponse.json(page(subscribers))),
    http.delete(`${API}/api/updates/subscribers/:id`, ({ params }) => {
      subscribers = subscribers.filter((s) => s.id !== Number(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${API}/api/updates/announcements`, () =>
      HttpResponse.json(page([{ id: 1, kind: 'video', title: 'Devlog 1', sentAt: '2026-10-03T10:00:00Z', recipientCount: 1 }])),
    ),
    http.get(`${API}/api/support/donations`, () =>
      HttpResponse.json(
        page([{ id: 1, type: 'Donation', fromName: 'Jo', message: 'Great site', amount: '3.00', currency: 'GBP', email: null, isPublic: true, receivedAt: '2026-10-04T10:00:00Z' }]),
      ),
    ),
  ]
}

describe('CommunityPage', () => {
  it('sends visitors home', async () => {
    renderApp('/community')

    await screen.findByText(/Nothing here yet/)
    expect(screen.queryByRole('heading', { name: 'Email subscribers' })).not.toBeInTheDocument()
  })

  it('shows subscribers, what was emailed and donations, and deletes a subscriber', async () => {
    server.use(signedIn(), ...communityApi())
    const user = userEvent.setup()
    renderApp('/community')

    const subscribers = within(await screen.findByRole('region', { name: 'Subscribers table' }))
    expect(subscribers.getByText('Waiting for confirmation')).toBeInTheDocument()
    expect(await screen.findByText('Devlog 1')).toBeInTheDocument()
    expect(await screen.findByText('Great site')).toBeInTheDocument()
    expect(screen.getByText('3.00 GBP')).toBeInTheDocument()

    await user.click(subscribers.getByRole('button', { name: 'Delete bob@example.com' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('1 in all')).toBeInTheDocument()
    expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument()
  })
})
