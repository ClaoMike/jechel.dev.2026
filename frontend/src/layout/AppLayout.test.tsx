import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { API, server, signedIn } from '../test/server'

const TAB_NAMES = ["What's new?", 'Apps', 'YouTube', 'About Me', 'Contact']

describe('AppLayout: greeting and session bar', () => {
  it('shows a loading state, then greets with the first name', async () => {
    renderApp('/')

    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0)
    expect(await screen.findByRole('heading', { level: 1, name: "Hi, I'm Claudiu" })).toBeInTheDocument()
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

describe('AppLayout: tabs', () => {
  const tabs = () => within(screen.getByRole('navigation', { name: 'Sections' }))

  it('shows the five sections in order', () => {
    renderApp('/')

    expect(tabs().getAllByRole('link').map((link) => link.textContent)).toEqual(TAB_NAMES)
  })

  it("/ shows What's new and marks its tab as current", async () => {
    renderApp('/')

    expect(screen.getByRole('heading', { level: 2, name: "What's new?" })).toBeInTheDocument()
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: "What's new?" })).toHaveAttribute('aria-current', 'page')
    for (const other of TAB_NAMES.filter((name) => name !== "What's new?")) {
      expect(tabs().getByRole('link', { name: other })).not.toHaveAttribute('aria-current')
    }
  })

  it('/apps shows the apps and marks its tab as current', async () => {
    renderApp('/apps')

    expect(screen.getByRole('heading', { level: 2, name: 'Apps' })).toBeInTheDocument()
    expect(await screen.findByText('No apps yet.')).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Apps' })).toHaveAttribute('aria-current', 'page')
  })

  it('/youtube shows the videos and marks its tab as current', async () => {
    renderApp('/youtube')

    expect(screen.getByRole('heading', { level: 2, name: 'YouTube' })).toBeInTheDocument()
    expect(await screen.findByText('No videos yet.')).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'YouTube' })).toHaveAttribute('aria-current', 'page')
  })

  it('switches sections when a tab is clicked', async () => {
    renderApp('/')

    await userEvent.click(tabs().getByRole('link', { name: 'About Me' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'About Me' })).toBeInTheDocument()

    await userEvent.click(tabs().getByRole('link', { name: 'Contact' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Contact me' })).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'page')
  })

  it('sends unknown URLs to the first section', () => {
    renderApp('/no-such-page')

    expect(screen.getByRole('heading', { level: 2, name: "What's new?" })).toBeInTheDocument()
  })
})
