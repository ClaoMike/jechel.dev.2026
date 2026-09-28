import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { API, signedIn, server } from '../test/server'

describe('AdminPage', () => {
  it('shows a Sign in with Google link that starts the login flow', async () => {
    renderApp('/admin')

    const link = await screen.findByRole('link', { name: /sign in with google/i })
    expect(link).toHaveAttribute('href', `${API}/api/auth/login?returnUrl=%2F`)
  })

  it.each([
    ['not_authorized', /not allowed/i],
    ['login_failed', /cancelled or failed/i],
    ['something_else', /something went wrong/i],
  ])('shows an error for ?error=%s', async (error, message) => {
    renderApp(`/admin?error=${error}`)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('redirects to the home page when already signed in', async () => {
    server.use(signedIn())
    renderApp('/admin')

    expect(await screen.findByRole('heading', { name: "Hi, I'm Claudiu" })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign in with google/i })).not.toBeInTheDocument()
  })
})
