import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError } from '../../services/api'
import { stubApi } from '../../test/api'
import { settings } from '../../test/fixtures/settings'
import { SITE } from '../../test/fixtures/site'
import { ADMIN, forever, renderView, textOf } from '../../test/render'
import { SettingsPage } from './SettingsPage'

// Settings → Resend: one sender people can answer, and one for subscribers that takes no replies.

function stub(values?: Record<string, string>) {
  stubApi()
  vi.spyOn(api.auth, 'listSessions').mockResolvedValue([])
  return {
    get: vi.spyOn(api.settings, 'get').mockResolvedValue(settings(values)),
    save: vi.spyOn(api.settings, 'save').mockImplementation(async (key, value) => settings({ ...values, [key]: value })),
  }
}

const resend = () => page.getByRole('region', { name: /^Resend \(email\)/ })
const openResend = async () => {
  await page.getByRole('button', { name: /^Resend \(email\)/ }).click()
  await expect.element(resend().getByRole('textbox', { name: /^Sender/ })).toBeVisible()
}
const sender = () => resend().getByRole('textbox', { name: /^Sender/ })
const updatesSender = () => resend().getByRole('textbox', { name: /^Updates sender/ })
const saveNextTo = (input: ReturnType<typeof sender>) => input.element().closest('.settings-field')!.querySelector<HTMLButtonElement>('button.button:not(.button-secondary)')!

describe('Settings: who emails come from', () => {
  it('has a sender for everything, and one for subscribers that takes no replies, without descriptions', async () => {
    stub({ 'Email:ResendApiKey': 're_123456789abcd', 'Email:From': 'jechel.dev <updates@jechel.dev>' })
    await renderView(<SettingsPage />, { user: ADMIN })
    await openResend()

    await expect.element(sender()).toHaveValue('jechel.dev <updates@jechel.dev>')
    await expect.element(updatesSender()).toHaveValue('')
    expect(updatesSender().element().getAttribute('placeholder')).toBe('jechel.dev <updates@jechel.dev>')
    // Just the fields: no descriptions or hints.
    expect(textOf(resend())).not.toMatch(/Confirmation emails for subscribers|Every email's sender|no mailbox/)
    expect(resend().element().querySelectorAll('.field-hint, .settings-card-body > p.muted')).toHaveLength(0)
  })

  it('saves the updates sender on its own', async () => {
    const stubs = stub({ 'Email:ResendApiKey': 're_123456789abcd', 'Email:From': 'Claudiu <hello@jechel.dev>' })
    await renderView(<SettingsPage />, { user: ADMIN })
    await openResend()

    await updatesSender().fill('jechel.dev <updates@jechel.dev>')
    saveNextTo(updatesSender()).click()

    await expect.poll(() => stubs.save.mock.calls).toEqual([['Email:UpdatesFrom', 'jechel.dev <updates@jechel.dev>']])
    await expect.element(resend().getByText('Saved.')).toBeVisible()
    await expect.poll(() => textOf(resend())).toContain('Updates sender (no replies) · set, saved here')
    await expect.element(updatesSender()).toHaveValue('jechel.dev <updates@jechel.dev>')
    await expect.element(sender()).toHaveValue('Claudiu <hello@jechel.dev>')
  })

  it("shows why an updates sender wasn't saved", async () => {
    const stubs = stub()
    stubs.save.mockRejectedValueOnce(
      new ApiError('/api/settings/Email%3AUpdatesFrom', 400, { value: ['Enter an address, or a name and address like: jechel.dev <updates@jechel.dev>'] }),
    )
    await renderView(<SettingsPage />, { user: ADMIN })
    await openResend()

    await updatesSender().fill('updates at jechel')
    saveNextTo(updatesSender()).click()

    await expect.element(resend().getByText('Enter an address, or a name and address like: jechel.dev <updates@jechel.dev>')).toBeVisible()
    await expect.element(updatesSender()).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('Settings: quick links', () => {
  const card = (name: RegExp) => page.getByRole('region', { name })

  it('Hosting opens Cloudflare and Railway, and Porkbun has its own card: links only, no status, no text', async () => {
    stub()
    await renderView(<SettingsPage />, { user: ADMIN })
    for (const [title, links] of [
      [
        /^Hosting/,
        [
          ['Cloudflare', 'https://dash.cloudflare.com'],
          ['Railway', 'https://railway.com/dashboard'],
        ],
      ],
      [/^Porkbun \(domain\)/, [['Porkbun', 'https://porkbun.com/account/domainsSpeedy']]],
    ] as const) {
      await page.getByRole('button', { name: title }).click()
      const opened = card(title)
      for (const [label, href] of links) {
        const link = opened.getByRole('link', { name: label })
        await expect.element(link).toHaveAttribute('href', href)
        await expect.element(link).toHaveAttribute('target', '_blank')
        await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer')
      }
      expect(opened.element().querySelectorAll('.settings-status, p, input')).toHaveLength(0)
      expect(textOf(opened)).not.toMatch(/Nothing to set|Not connected|Later/)
    }
  })
})

describe('Settings: Connections', () => {
  const connections = () => page.getByRole('region', { name: 'Connections', exact: true })
  const services = () =>
    connections()
      .getByRole('button', { expanded: false })
      .or(connections().getByRole('button', { expanded: true }))
  const ORDER = ['Buy Me a Coffee', 'Cal.com (meetings)', 'Google sign-in', 'Hosting', 'ntfy (phone alerts)', 'Porkbun (domain)', 'Resend (email)', 'YouTube Data API']

  it('is one card with its title inside, the services in it A to Z, with no description', async () => {
    stub()
    await renderView(<SettingsPage />, { user: ADMIN })
    await expect.element(connections()).toBeVisible()
    expect(connections().element().classList.contains('card')).toBe(true)
    expect(connections().element().querySelector('h3')!.textContent).toBe('Connections')
    const titles = [...connections().element().querySelectorAll('.accordion-title')].map((t) => t.textContent)
    expect(titles).toEqual(ORDER)
    expect(titles).toEqual([...titles].sort((a, b) => a!.localeCompare(b!, 'en', { sensitivity: 'base' })))
    expect(textOf(connections())).not.toContain('The services this site connects to')
    // Each service is a row inside the card, not a card of its own.
    for (const row of connections().element().querySelectorAll('.settings-card')) expect(row.classList.contains('card')).toBe(false)
  })

  it('keeps every service folded until opened, one at a time as clicked', async () => {
    stub()
    await renderView(<SettingsPage />, { user: ADMIN })
    await expect.element(connections()).toBeVisible()
    await expect.poll(() => services().elements().length).toBe(ORDER.length)
    expect(
      services()
        .elements()
        .every((b) => b.getAttribute('aria-expanded') === 'false'),
    ).toBe(true)

    const resend = connections().getByRole('button', { name: /^Resend \(email\)/ })
    await resend.click()
    await expect.element(resend).toHaveAttribute('aria-expanded', 'true')
    await expect.element(connections().getByRole('textbox', { name: /^Sender/ })).toBeVisible()
    await resend.click()
    await expect.element(resend).toHaveAttribute('aria-expanded', 'false')
    expect(
      connections()
        .getByRole('textbox', { name: /^Sender/ })
        .query(),
    ).toBeNull()
  })

  it('shows its title while loading and when the settings could not be loaded', async () => {
    stubApi({ user: ADMIN })
    vi.spyOn(api.auth, 'listSessions').mockResolvedValue([])
    const get = vi.spyOn(api.settings, 'get').mockReturnValueOnce(forever())
    const loading = await renderView(<SettingsPage />, { user: ADMIN })
    await expect.element(connections().getByRole('status')).toHaveTextContent('Loading the settings…')
    await loading.unmount()

    get.mockRejectedValueOnce(new ApiError('/api/settings', 500)).mockResolvedValue(settings())
    await renderView(<SettingsPage />, { user: ADMIN })
    await expect.element(connections().getByText("The settings couldn't be loaded.")).toBeVisible()
    await connections().getByRole('button', { name: 'Try again' }).click()
    await expect.poll(() => connections().element().querySelectorAll('.accordion-title').length).toBe(ORDER.length)
  })
})

describe('Settings: no descriptions', () => {
  it('Visitor pages, Signed-in devices and the services say only what they are', async () => {
    stub()
    await renderView(<SettingsPage />, { user: ADMIN, site: structuredClone(SITE) })
    await expect.element(page.getByRole('region', { name: 'Connections', exact: true })).toBeVisible()
    for (const name of ['Google sign-in', 'YouTube Data API', 'ntfy (phone alerts)', 'Buy Me a Coffee'])
      await page.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }).click()
    const text = document.body.textContent!
    for (const gone of [
      'What visitors can see',
      'Every device signed in as you',
      'How you sign in to this site',
      'The YouTube tab and What',
      'Alerts on your phone',
      "The header's Buy me a coffee button",
      'The services this site connects to',
    ])
      expect(text).not.toContain(gone)
  })
})
