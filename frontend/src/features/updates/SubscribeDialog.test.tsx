import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../../test/render'
import { API, server } from '../../test/server'

async function openDialog() {
  const user = userEvent.setup()
  renderApp('/')
  await user.click(await screen.findByRole('button', { name: 'Get updates by email' }))
  return { user, dialog: within(screen.getByRole('dialog', { name: 'Get updates' })) }
}

describe('Get updates', () => {
  it('subscribes and says to check the inbox', async () => {
    const sent: unknown[] = []
    server.use(
      http.post(`${API}/api/updates/subscribe`, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ status: 'sent' })
      }),
    )
    const { user, dialog } = await openDialog()

    await user.type(dialog.getByLabelText('Email'), ' ada@example.com ')
    await user.click(dialog.getByRole('button', { name: 'Subscribe' }))

    expect(await dialog.findByRole('status')).toHaveTextContent('check ada@example.com and click the link')
    expect(sent).toEqual([{ email: 'ada@example.com' }])
  })

  it('says when the address is already subscribed', async () => {
    server.use(http.post(`${API}/api/updates/subscribe`, () => HttpResponse.json({ status: 'alreadySubscribed' })))
    const { user, dialog } = await openDialog()

    await user.type(dialog.getByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.click(dialog.getByRole('button', { name: 'Subscribe' }))

    expect(await dialog.findByRole('status')).toHaveTextContent('ada@example.com is already subscribed')
  })

  it('says when a confirmation was sent lately', async () => {
    server.use(http.post(`${API}/api/updates/subscribe`, () => HttpResponse.json({ status: 'pending' })))
    const { user, dialog } = await openDialog()

    await user.type(dialog.getByLabelText('Email', { exact: true }), 'ada@example.com')
    await user.click(dialog.getByRole('button', { name: 'Subscribe' }))

    expect(await dialog.findByRole('status')).toHaveTextContent('We already sent a confirmation to ada@example.com')
  })

  it('checks the address before sending anything', async () => {
    const { user, dialog } = await openDialog()

    await user.type(dialog.getByLabelText('Email'), 'nope')
    await user.click(dialog.getByRole('button', { name: 'Subscribe' }))

    expect(dialog.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(dialog.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('says when there were too many tries', async () => {
    server.use(http.post(`${API}/api/updates/subscribe`, () => new HttpResponse(null, { status: 429 })))
    const { user, dialog } = await openDialog()

    await user.type(dialog.getByLabelText('Email'), 'ada@example.com')
    await user.click(dialog.getByRole('button', { name: 'Subscribe' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('Too many tries')
  })
})

describe('Buy me a coffee', () => {
  it('links to the configured page in a new tab', async () => {
    server.use(http.get(`${API}/api/support`, () => HttpResponse.json({ url: 'https://ko-fi.com/jechel' })))
    renderApp('/')

    const link = await screen.findByRole('link', { name: 'Buy me a coffee (opens in a new tab)' })
    expect(link).toHaveAttribute('href', 'https://ko-fi.com/jechel')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('is hidden when no page is set', async () => {
    renderApp('/')

    await screen.findByRole('button', { name: 'Get updates by email' })
    expect(screen.queryByRole('link', { name: /Buy me a coffee/ })).not.toBeInTheDocument()
  })
})
