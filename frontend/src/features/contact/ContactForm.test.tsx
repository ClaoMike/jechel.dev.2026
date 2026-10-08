import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '../../test/render'
import { API, LONG_MESSAGE, server } from '../../test/server'

let received: unknown[] = []

beforeEach(() => {
  received = []
  server.use(
    http.post(`${API}/api/contact`, async ({ request }) => {
      received.push(await request.json())
      return new HttpResponse(null, { status: 201 })
    }),
  )
})

async function renderForm() {
  const user = userEvent.setup()
  renderApp('/contact')
  await screen.findByRole('heading', { name: 'Contact me' })
  return user
}

const nameInput = () => screen.getByLabelText('Name')
const emailInput = () => screen.getByLabelText('Email')
const messageInput = () => screen.getByLabelText('Message')
const submit = () => screen.getByRole('button', { name: /send message/i })

describe('ContactForm', () => {
  it('is what visitors see on the Contact tab', async () => {
    await renderForm()

    expect(nameInput()).toHaveValue('')
    expect(emailInput()).toHaveAttribute('type', 'email')
    expect(messageInput()).toHaveAttribute('maxLength', '1000')
    expect(screen.getByText('Between 100 and 1000 characters.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('counts message characters as you type', async () => {
    const user = await renderForm()

    expect(screen.getByText('0 / 1000')).toBeInTheDocument()
    await user.type(messageInput(), '  Hello  ')

    expect(screen.getByText('5 / 1000')).toBeInTheDocument()
  })

  it('shows every problem on submit, focuses the first, and sends nothing', async () => {
    const user = await renderForm()

    await user.type(emailInput(), 'not-an-email')
    await user.type(messageInput(), 'Too short.')
    await user.click(submit())

    expect(screen.getByText('Please enter your name.')).toBeInTheDocument()
    expect(screen.getByText(/valid email address/)).toBeInTheDocument()
    expect(screen.getByText(/at least 100 characters \(90 more\)/)).toBeInTheDocument()
    expect(nameInput()).toHaveFocus()
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput()).toHaveAccessibleDescription('Please enter your name.')
    expect(received).toEqual([])
  })

  it('rejects a name that is only spaces', async () => {
    const user = await renderForm()
    expect(nameInput()).toBeRequired()

    await user.type(nameInput(), '    ')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(messageInput(), LONG_MESSAGE)
    await user.click(submit())

    expect(screen.getByText('Please enter your name.')).toBeInTheDocument()
    expect(received).toEqual([])
  })

  it('updates errors as you type once you have tried to submit', async () => {
    const user = await renderForm()
    await user.click(submit())
    expect(screen.getByText('Please enter your name.')).toBeInTheDocument()

    await user.type(nameInput(), 'Ada')

    expect(screen.queryByText('Please enter your name.')).not.toBeInTheDocument()
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
  })

  it('does not show errors before the first submit', async () => {
    const user = await renderForm()

    await user.type(emailInput(), 'nope')

    expect(screen.queryByText(/valid email address/)).not.toBeInTheDocument()
  })

  it('sends the trimmed message and thanks the visitor', async () => {
    const user = await renderForm()

    await user.type(nameInput(), '  Ada Lovelace ')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(messageInput(), `  ${LONG_MESSAGE}  `)
    await user.click(submit())

    expect(await screen.findByRole('status')).toHaveTextContent('Your message was sent. I\'ll get back to you at ada@example.com.')
    expect(received).toEqual([{ name: 'Ada Lovelace', email: 'ada@example.com', message: LONG_MESSAGE }])

    await user.click(screen.getByRole('button', { name: 'Send another message' }))
    expect(nameInput()).toHaveValue('')
    expect(messageInput()).toHaveValue('')
  })

  it('disables the button while sending', async () => {
    let release!: () => void
    server.use(
      http.post(`${API}/api/contact`, async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return new HttpResponse(null, { status: 201 })
      }),
    )
    const user = await renderForm()
    await user.type(nameInput(), 'Ada')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(messageInput(), LONG_MESSAGE)

    await user.click(submit())

    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled()
    release()
    expect(await screen.findByText('Thank you!')).toBeInTheDocument()
  })

  it('shows the field errors the API returns', async () => {
    server.use(
      http.post(`${API}/api/contact`, () =>
        HttpResponse.json({ title: 'One or more validation errors occurred.', status: 400, errors: { email: ['Email is not a valid email address.'] } }, { status: 400 }),
      ),
    )
    const user = await renderForm()
    await user.type(nameInput(), 'Ada')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(messageInput(), LONG_MESSAGE)

    await user.click(submit())

    expect(await screen.findByText('Email is not a valid email address.')).toBeInTheDocument()
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Thank you!')).not.toBeInTheDocument()
  })

  it('keeps what was typed and says so when sending fails', async () => {
    server.use(http.post(`${API}/api/contact`, () => new HttpResponse(null, { status: 500 })))
    const user = await renderForm()
    await user.type(nameInput(), 'Ada')
    await user.type(emailInput(), 'ada@example.com')
    await user.type(messageInput(), LONG_MESSAGE)

    await user.click(submit())

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't be sent/)
    expect(messageInput()).toHaveValue(LONG_MESSAGE)
    expect(submit()).toBeEnabled()
  })
})
