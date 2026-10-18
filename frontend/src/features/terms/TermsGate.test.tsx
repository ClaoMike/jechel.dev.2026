import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../test/render'
import { API, server, signedIn, termsDocument } from '../../test/server'
import { acceptedVersion, rememberAcceptance } from './acceptance'

const gate = () => screen.findByRole('dialog', { name: 'Welcome to jechel.dev' })

describe('The welcome popup', () => {
  beforeEach(() => localStorage.clear())

  it('asks first-time visitors to tick every box before they continue', async () => {
    const user = userEvent.setup()
    renderApp('/')

    const dialog = within(await gate())
    const boxes = dialog.getAllByRole('checkbox')
    const continueButton = dialog.getByRole('button', { name: 'Continue' })
    expect(boxes).toHaveLength(3)
    expect(continueButton).toBeDisabled()

    await user.click(boxes[0])
    await user.click(boxes[1])
    expect(continueButton).toBeDisabled()
    await user.click(boxes[2])
    expect(continueButton).toBeEnabled()

    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    await user.click(continueButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(acceptedVersion()).toBe('default')
  })

  it("can't be closed with Escape, a click outside, or a close button", async () => {
    const user = userEvent.setup()
    renderApp('/')

    const dialog = await gate()
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.pointer({ keys: '[MouseLeft]', target: dialog.parentElement! })

    expect(screen.getByRole('dialog', { name: 'Welcome to jechel.dev' })).toBeInTheDocument()
  })

  it('opens the terms on top of it, and comes back when they close', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(within(await gate()).getByRole('button', { name: 'Terms and Conditions' }))

    const terms = screen.getByRole('dialog', { name: 'Terms and Conditions' })
    expect(within(terms).getByRole('heading', { name: '1. Using the website' })).toBeInTheDocument()
    expect(within(terms).getByText('No spam')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Terms and Conditions' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Welcome to jechel.dev' })).toBeInTheDocument()
  })

  it('is not shown again once accepted', async () => {
    rememberAcceptance('default')
    renderApp('/')

    await screen.findByText(/Nothing here yet/)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks again when the terms have changed since', async () => {
    rememberAcceptance('default')
    server.use(http.get(`${API}/api/terms`, () => HttpResponse.json({ ...termsDocument(), updatedAt: '2026-10-12T12:00:00Z' })))
    renderApp('/')

    await gate()
  })

  it('is not shown to the signed-in admin', async () => {
    server.use(signedIn())
    renderApp('/')

    await screen.findByText('Signed in as admin@example.com')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it("isn't shown on the admin's sign-in page", async () => {
    localStorage.clear()
    renderApp('/admin')

    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Welcome to jechel.dev' })).not.toBeInTheDocument()
  })
})
