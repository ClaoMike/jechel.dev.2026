import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { api, ApiError, setRequestPreview } from '../../services/api'
import { renderApp } from '../../test/render'
import { aboutApi, API, server, signedIn } from '../../test/server'
import { setPreviewMode } from './preview'

afterEach(() => {
  setPreviewMode('normal')
  setRequestPreview('normal')
})

describe('the request preview', () => {
  it('fails content requests with a 500 in "error", but never sign-in or saving', async () => {
    let saved = false
    server.use(signedIn(), http.post(`${API}/api/contact`, () => {
      saved = true
      return new HttpResponse(null, { status: 201 })
    }))
    setRequestPreview('error')

    await expect(api.about.get()).rejects.toMatchObject({ status: 500 })
    await expect(api.about.get()).rejects.toBeInstanceOf(ApiError)
    expect(await api.auth.me()).not.toBeNull()
    await api.contact.send({ name: 'A', email: 'a@example.com', message: 'm'.repeat(100) })
    expect(saved).toBe(true)
  })

  it('holds content requests in "loading" until they are cancelled', async () => {
    setRequestPreview('loading')
    const controller = new AbortController()

    const request = api.about.get(controller.signal)
    let settled = false
    void request.then(() => (settled = true), () => (settled = true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(settled).toBe(false)

    controller.abort()
    await expect(request).rejects.not.toBeInstanceOf(ApiError)
  })
})

describe('the preview switch', () => {
  async function renderAboutAsAdmin() {
    server.use(signedIn(), ...aboutApi().handlers)
    const user = userEvent.setup()
    renderApp('/about')
    await screen.findByRole('region', { name: 'Skills' })
    return { user, preview: within(screen.getByRole('group', { name: 'Preview the site as' })) }
  }

  it("is only for the admin", async () => {
    renderApp('/about')

    await screen.findByRole('region', { name: 'Skills' })
    expect(screen.queryByRole('group', { name: 'Preview the site as' })).not.toBeInTheDocument()
  })

  it('shows every view loading, failing (with Try again), then normal again', async () => {
    const { user, preview } = await renderAboutAsAdmin()

    await user.click(preview.getByLabelText('Loading'))
    expect(await screen.findByText('Loading About Me…')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Skills' })).not.toBeInTheDocument()

    await user.click(preview.getByLabelText('Error'))
    expect(await screen.findByText("This page couldn't be loaded.")).toBeInTheDocument()
    expect(screen.getByRole('alert')).toContainElement(screen.getByRole('button', { name: 'Try again' }))

    await user.click(preview.getByLabelText('Normal'))
    expect(await screen.findByRole('region', { name: 'Skills' })).toBeInTheDocument()
  })
})
