import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../../layout/theme'
import { api, ApiError } from '../../../services/api'
import { a11yViolations } from '../../../test/a11y'
import { SITE } from '../../../test/fixtures/site'
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

describe('what the message is about', () => {
  const topic = () => page.getByRole('combobox', { name: "What's it about?" })
  const withWorkWithMe = (on: boolean) => ({ site: { ...SITE, features: { ...SITE.features, workWithMe: on } } })

  it("doesn't ask while Work with me is switched off, and sends no topic", async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm />, withWorkWithMe(false))
    await expect.element(field('Name')).toBeVisible()
    expect(topic().query()).toBeNull()
    await fill()
    await submit().click()
    await expect.poll(() => send.mock.calls.length).toBe(1)
    expect(send.mock.calls[0][0]).toEqual({ name: 'Ada', email: 'ada@example.com', message: LONG })
  })

  it('asks once Work with me is on: anything by default, or a project, sent as one', async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm />, withWorkWithMe(true))
    await expect.element(topic()).toHaveValue('')
    expect(topic().element().querySelectorAll('option')).toHaveLength(2)
    await fill()
    await topic().selectOptions('A project: working with me')
    await submit().click()
    await expect.poll(() => send.mock.calls.length).toBe(1)
    expect(send.mock.calls[0][0]).toEqual({ name: 'Ada', email: 'ada@example.com', message: LONG, topic: 'project' })
  })

  it('sends no topic for anything else, and starts again on anything after sending', async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm />, withWorkWithMe(true))
    await fill()
    await topic().selectOptions('A project: working with me')
    await topic().selectOptions('A question, or anything else')
    await submit().click()
    await expect.poll(() => send.mock.calls.length).toBe(1)
    expect(send.mock.calls[0][0]).not.toHaveProperty('topic')

    await page.getByRole('button', { name: 'Send another message' }).click()
    await expect.element(topic()).toHaveValue('')
  })

  it("a form that's about a project (Work with me's own) has its own words, never asks, and always sends it as one", async () => {
    const send = vi.spyOn(api.contact, 'send').mockResolvedValue()
    await renderView(<ContactForm topic="project" title="Tell me about your project" intro="What you'd like built." />, withWorkWithMe(true))
    await expect.element(page.getByRole('heading', { name: 'Tell me about your project' })).toBeVisible()
    await expect.element(page.getByText("What you'd like built.")).toBeVisible()
    expect(topic().query()).toBeNull()
    await fill()
    await submit().click()
    await expect.poll(() => send.mock.calls.length).toBe(1)
    expect(send.mock.calls[0][0]).toEqual({ name: 'Ada', email: 'ada@example.com', message: LONG, topic: 'project' })

    await page.getByRole('button', { name: 'Send another message' }).click()
    await fill()
    await submit().click()
    await expect.poll(() => send.mock.calls.length).toBe(2)
    expect(send.mock.calls[1][0]).toHaveProperty('topic', 'project')
  })
})

