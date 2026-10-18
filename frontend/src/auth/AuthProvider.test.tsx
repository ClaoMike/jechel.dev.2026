import { act, fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { API, server, TEST_USER } from '../test/server'
import { ACTIVITY_REFRESH_MS } from './AuthProvider'
import { RETRY_DELAYS_MS } from './authContext'

describe('AuthProvider session handling', () => {
  let meCalls = 0
  let signedIn = true

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    meCalls = 0
    signedIn = true
    server.use(
      http.get(`${API}/api/auth/me`, () => {
        meCalls++
        return signedIn ? HttpResponse.json(TEST_USER) : new HttpResponse(null, { status: 401 })
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stays signed in when the API is down at first (e.g. restarting), and asks again until it answers", async () => {
    let down = true
    server.use(
      http.get(`${API}/api/auth/me`, () => {
        meCalls++
        return down ? HttpResponse.error() : HttpResponse.json(TEST_USER)
      }),
    )
    renderApp('/')

    await act(() => vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1]))
    expect(meCalls).toBe(3)
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument()

    down = false
    await act(() => vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[2]))

    expect(await screen.findByText('Signed in as admin@example.com')).toBeInTheDocument()
  })

  it('a 500 is no answer either: it asks again', async () => {
    let failing = true
    server.use(
      http.get(`${API}/api/auth/me`, () => {
        meCalls++
        return failing ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(TEST_USER)
      }),
    )
    renderApp('/')
    await act(() => vi.advanceTimersByTimeAsync(10))
    failing = false
    await act(() => vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]))

    expect(await screen.findByText('Signed in as admin@example.com')).toBeInTheDocument()
  })

  it('signs out in the UI when the session ends without activity', async () => {
    renderApp('/')
    expect(await screen.findByText('Signed in as admin@example.com')).toBeInTheDocument()

    signedIn = false // the server ends the session after 10 idle minutes
    await act(() => vi.advanceTimersByTimeAsync(TEST_USER.sessionExpiresInSeconds * 1000 + 2_000))

    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument()
  })

  it('refreshes the session on user activity, at most once a minute', async () => {
    renderApp('/')
    await screen.findByText('Signed in as admin@example.com')
    expect(meCalls).toBe(1)

    fireEvent.keyDown(window)
    fireEvent.pointerDown(window)
    expect(meCalls).toBe(1)

    await act(() => vi.advanceTimersByTimeAsync(ACTIVITY_REFRESH_MS))
    fireEvent.keyDown(window)
    await vi.waitFor(() => expect(meCalls).toBe(2))

    fireEvent.keyDown(window)
    expect(meCalls).toBe(2)
  })

  it('does not ping the API on activity when signed out', async () => {
    signedIn = false
    renderApp('/')
    await screen.findByRole('heading', { name: 'jechel.dev' })

    await act(() => vi.advanceTimersByTimeAsync(ACTIVITY_REFRESH_MS))
    fireEvent.keyDown(window)

    expect(meCalls).toBe(1)
  })
})
