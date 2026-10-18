import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { API, server } from '../test/server'

describe('The links in update emails', () => {
  it('confirms a subscription', async () => {
    const tokens: string[] = []
    server.use(
      http.post(`${API}/api/updates/confirm`, ({ request }) => {
        tokens.push(new URL(request.url).searchParams.get('token') ?? '')
        return HttpResponse.json({ email: 'ada@example.com' })
      }),
    )
    renderApp('/updates/confirm?token=abc')

    expect(await screen.findByRole('status')).toHaveTextContent("You're subscribed as ada@example.com")
    expect(tokens[0]).toBe('abc')
  })

  it('says when a confirmation link is no longer valid', async () => {
    server.use(http.post(`${API}/api/updates/confirm`, () => new HttpResponse(null, { status: 404 })))
    renderApp('/updates/confirm?token=old')

    expect(await screen.findByRole('alert')).toHaveTextContent("isn't valid any more")
  })

  it('unsubscribes', async () => {
    server.use(http.post(`${API}/api/updates/unsubscribe`, () => new HttpResponse(null, { status: 204 })))
    renderApp('/updates/unsubscribe?token=abc')

    expect(await screen.findByRole('status')).toHaveTextContent("You're unsubscribed")
  })

  it('needs a token', async () => {
    renderApp('/updates/unsubscribe')

    expect(await screen.findByRole('alert')).toHaveTextContent("isn't complete")
  })
})
