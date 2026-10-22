import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../../layout/theme'
import { api, ApiError } from '../../../services/api'
import { a11yViolations } from '../../../test/a11y'
import { renderView, textOf } from '../../../test/render'
import { MESSAGE_MAX_LENGTH, MESSAGE_MIN_LENGTH } from '../contactRules'
import { ContactForm } from './ContactForm'

// The public "Contact me" form: errors after the first try, then as you type; sent, thanks; why it wasn't, when it wasn't.

const LONG = 'Hello Claudiu! I played the Space Game and loved the lighthouse level. Could we talk about how you built the beam? Thanks!'
const field = (name: 'Name' | 'Email' | 'Message') => page.getByRole('textbox', { name })
const submit = () => page.getByRole('button', { name: 'Send message' })

async function fill(name = 'Ada', email = 'ada@example.com', message = LONG) {
  await field('Name').fill(name)
  await field('Email').fill(email)
  await field('Message').fill(message)
}

describe('the contact form', () => {
  it('counts the message as it is typed, and marks it short under the minimum', async () => {
    await renderView(<ContactForm />)
    await field('Message').fill('Too short')
    const counter = document.querySelector('.counter')!
    expect(counter.textContent).toBe(`9 / ${MESSAGE_MAX_LENGTH}`)
    expect(counter.classList.contains('counter-short')).toBe(true)
    await field('Message').fill('x'.repeat(MESSAGE_MIN_LENGTH))
    expect(counter.classList.contains('counter-short')).toBe(false)
  })

  it('shows no errors before the first try, every one on it, focuses the first, and sends nothing', async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm />)
    await field('Message').fill('short')
    expect(document.querySelectorAll('.field-error')).toHaveLength(0)

    await submit().click()
    await expect.element(field('Name')).toHaveAttribute('aria-invalid', 'true')
    await expect.element(field('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect.element(field('Message')).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(field('Name').element())
    expect(send).not.toHaveBeenCalled()
  })

  it('updates the errors as it is typed, once tried', async () => {
    await renderView(<ContactForm />)
    await submit().click()
    await expect.element(field('Name')).toHaveAttribute('aria-invalid', 'true')
    await field('Name').fill('Ada')
    await expect.element(field('Name')).not.toHaveAttribute('aria-invalid')
  })

  it('takes a name of only spaces as no name', async () => {
    await renderView(<ContactForm />)
    await fill('   ')
    await submit().click()
    await expect.element(field('Name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sends it trimmed, then thanks them at their address, and can start again', async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm />)
    await fill('  Ada  ', ' ada@example.com ', `  ${LONG}  `)
    await submit().click()

    await expect.element(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible()
    expect(send).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com', message: LONG })
    expect(textOf(page.getByRole('status'))).toBe("Your message was sent. I'll get back to you at ada@example.com.")

    await page.getByRole('button', { name: 'Send another message' }).click()
    await expect.element(field('Name')).toHaveValue('')
  })

  it('waits while sending', async () => {
    let finish!: () => void
    vi.spyOn(api.contact, 'send').mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)))
    await renderView(<ContactForm />)
    await fill()
    await submit().click()
    await expect.element(page.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    finish()
    await expect.element(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible()
  })

  it("shows the API's word on a field next to it", async () => {
    vi.spyOn(api.contact, 'send').mockRejectedValueOnce(new ApiError('/api/contact', 400, { email: ['That address takes no email.'] }))
    await renderView(<ContactForm />)
    await fill()
    await submit().click()
    await expect.element(field('Email')).toHaveAccessibleDescription('That address takes no email.')
  })

  it('says to wait after several messages in a short while, and keeps what was typed', async () => {
    vi.spyOn(api.contact, 'send').mockRejectedValueOnce(new ApiError('/api/contact', 429))
    await renderView(<ContactForm />)
    await fill()
    await submit().click()
    await expect.element(page.getByRole('alert')).toHaveTextContent('Several messages in a short while: please try again in a few minutes.')
    await expect.element(field('Message')).toHaveValue(LONG)
    await expect.element(submit()).toBeEnabled()
  })

  it('says when it failed otherwise, and keeps what was typed', async () => {
    vi.spyOn(api.contact, 'send').mockRejectedValueOnce(new ApiError('/api/contact', 500))
    await renderView(<ContactForm />)
    await fill()
    await submit().click()
    await expect.element(page.getByRole('alert')).toHaveTextContent("Your message couldn't be sent. Please try again in a moment.")
    await expect.element(field('Name')).toHaveValue('Ada')
  })

  it('can be filled and sent from the keyboard alone', async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm />)
    ;(field('Name').element() as HTMLElement).focus()
    await userEvent.keyboard('Ada')
    await userEvent.tab()
    await userEvent.keyboard('ada@example.com')
    await userEvent.tab()
    await userEvent.keyboard(LONG)
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => send.mock.calls.length).toBe(1)
  })

  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems, errors showing too`, async () => {
      await renderView(<ContactForm />, { theme })
      await submit().click()
      await expect.element(field('Name')).toHaveAttribute('aria-invalid', 'true')
      expect(await a11yViolations()).toEqual([])
    })
  }
})
