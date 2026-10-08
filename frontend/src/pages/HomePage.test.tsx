import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { API, server, signedIn } from '../test/server'

describe('HomePage', () => {
  it('shows a loading state, then greets with the first name', async () => {
    renderApp('/')

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: "Hi, I'm Claudiu" })).toBeInTheDocument()
  })

  it('shows an error message when the API fails', async () => {
    server.use(http.get(`${API}/api/firstname`, () => new HttpResponse(null, { status: 500 })))

    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })

  it('does not show the session bar to anonymous visitors', async () => {
    renderApp('/')

    await screen.findByRole('heading', { name: "Hi, I'm Claudiu" })
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })

  it('shows the signed-in user and signs out', async () => {
    server.use(signedIn())
    renderApp('/')

    expect(await screen.findByText('Signed in as admin@example.com')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument()
  })
})
