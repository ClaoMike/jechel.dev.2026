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

describe('Settings: receiving email', () => {
  it('shows where Resend sends the emails it receives, and saves its signing secret', async () => {
    const stubs = stub({ 'Email:ResendApiKey': 're_123456789abcd', 'Email:From': 'Claudiu <hello@jechel.dev>' })
    await renderView(<SettingsPage />, { user: ADMIN })
    await openResend()

    const receiving = resend().getByRole('group').filter({ hasText: 'Receiving email' })
    await resend().getByText('Receiving email').click()
    await expect.poll(() => textOf(receiving)).toContain('https://jechel.dev/api/contact/inbound')
    expect(
      resend()
        .getByRole('link', { name: /Webhooks/ })
        .element()
        .getAttribute('href'),
    ).toBe('https://resend.com/webhooks')

    const secret = resend().getByLabelText(/^Receiving webhook secret/)
    await secret.fill('whsec_abc123')
    saveNextTo(secret).click()

    await expect.poll(() => stubs.save.mock.calls).toEqual([['Email:InboundWebhookSecret', 'whsec_abc123']])
  })
})

describe('Settings: quick links', () => {
  const card = (name: RegExp) => page.getByRole('region', { name })

  it('Hosting opens Cloudflare and Sliplane, and Porkbun has its own card: links only, no status, no text', async () => {
    stub()
    await renderView(<SettingsPage />, { user: ADMIN })
    for (const [title, links] of [
      [
        /^Hosting/,
        [
          ['Cloudflare', 'https://dash.cloudflare.com'],
          ['Sliplane', 'https://sliplane.io'],
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

describe('Settings: a setting', () => {
  const card = (name: RegExp) => page.getByRole('region', { name })
  const openCard = async (name: RegExp) => {
    inCard = name
    await page.getByRole('button', { name }).click()
    await expect.element(page.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'true')
  }
  let inCard = /./
  const fieldOf = (label: RegExp) => card(inCard).getByLabelText(label)
  const saveOf = (label: RegExp) => fieldOf(label).element().closest('.settings-field')!.querySelector<HTMLButtonElement>('button.button:not(.button-secondary)')!
  const removeOf = (label: RegExp) => fieldOf(label).element().closest('.settings-field')!.querySelector<HTMLButtonElement>('button.button-secondary:last-of-type')!

  it('generates a long random ntfy topic, saves it, and says so', async () => {
    const stubs = stub()
    await renderView(<SettingsPage />, { user: ADMIN })
    await openCard(/^ntfy/)

    await card(/^ntfy/).getByRole('button', { name: 'Generate' }).click()
    const topic = (fieldOf(/^Topic/).element() as HTMLInputElement).value
    expect(topic).toMatch(/^jechel-[0-9a-f]{24}$/)
    saveOf(/^Topic/).click()

    await expect.poll(() => stubs.save.mock.calls).toEqual([['Alerts:NtfyTopic', topic]])
    await expect.element(card(/^ntfy/).getByText('Saved.')).toBeVisible()
  })

  it('a secret shows only its last characters and where it comes from, takes a new one, and can be removed', async () => {
    const stubs = stub({ 'YouTube:ApiKey': 'AIzaSyExample1234' })
    await renderView(<SettingsPage />, { user: ADMIN })
    await openCard(/^YouTube Data API/)
    const key = fieldOf(/^API key/)

    expect(textOf(card(/^YouTube Data API/))).toContain('API key · set, ends in 1234, saved here')
    await expect.element(key).toHaveValue('')
    expect(key.element().getAttribute('placeholder')).toBe('Paste a new value to replace it')
    expect(saveOf(/^API key/).disabled).toBe(true)

    await key.fill('  AIzaSyNewKey9876  ')
    saveOf(/^API key/).click()
    await expect.poll(() => stubs.save.mock.calls[0]).toEqual(['YouTube:ApiKey', 'AIzaSyNewKey9876'])
    await expect.element(key).toHaveValue('')

    removeOf(/^API key/).click()
    await expect.poll(() => stubs.save.mock.calls[1]).toEqual(['YouTube:ApiKey', ''])
    await expect.element(card(/^YouTube Data API/).getByText('Removed.')).toBeVisible()
  })

  it('says when a value comes from the server, or couldn’t be saved', async () => {
    const stubs = stub()
    const fromServer = settings({ 'YouTube:Channel': '@claomike' })
    fromServer.settings = fromServer.settings.map((s) => (s.key === 'YouTube:Channel' ? { ...s, source: 'configuration' } : s))
    stubs.get.mockResolvedValue(fromServer)
    stubs.save.mockRejectedValueOnce(new ApiError('/api/settings/YouTube%3AChannel', 500))
    await renderView(<SettingsPage />, { user: ADMIN })
    await openCard(/^YouTube Data API/)

    expect(textOf(card(/^YouTube Data API/))).toContain('Channel (@handle or UC… id) · set, from the server configuration')
    expect(
      card(/^YouTube Data API/)
        .getByRole('button', { name: 'Remove' })
        .query(),
    ).toBeNull()
    await fieldOf(/^Channel/).fill('@someone')
    saveOf(/^Channel/).click()
    await expect.element(card(/^YouTube Data API/).getByText("That couldn't be saved. Please try again.")).toBeVisible()
    await expect.element(fieldOf(/^Channel/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('a test button says how it went: worked, refused, or couldn’t run', async () => {
    stub()
    const test = vi
      .spyOn(api.settings, 'test')
      .mockResolvedValueOnce({ ok: true, message: 'Sent. It should be on your phone now.' })
      .mockResolvedValueOnce({ ok: false, message: 'Set the topic first.' })
      .mockRejectedValueOnce(new ApiError('/api/settings/test/ntfy', 500))
    await renderView(<SettingsPage />, { user: ADMIN })
    await openCard(/^ntfy/)
    const button = card(/^ntfy/).getByRole('button', { name: 'Send a test alert' })

    await button.click()
    await expect.element(card(/^ntfy/).getByRole('status')).toHaveTextContent('✓ Sent. It should be on your phone now.')
    await button.click()
    await expect.element(card(/^ntfy/).getByRole('status')).toHaveTextContent('Set the topic first.')
    expect(card(/^ntfy/).getByRole('status').element().className).toBe('field-error')
    await button.click()
    await expect.element(card(/^ntfy/).getByRole('status')).toHaveTextContent("The test couldn't run. Please try again.")
    expect(test).toHaveBeenCalledWith('ntfy')
  })

  it('Google sign-in says whether it’s set up and how many may sign in', async () => {
    stub()
    await renderView(<SettingsPage />, { user: ADMIN })
    await openCard(/^Google sign-in/)
    expect(textOf(card(/^Google sign-in/))).toContain('Set up · client 1234abcd…')
    expect(textOf(card(/^Google sign-in/))).toContain('1 email allowed')
    expect(textOf(card(/^Google sign-in/))).toContain('https://jechel.dev/api/auth/signin-google')
  })

  it('…or that it isn’t', async () => {
    const stubs = stub()
    stubs.get.mockResolvedValue({
      ...settings(),
      google: { isConfigured: false, clientIdHint: null, adminEmailCount: 2, redirectUri: 'https://jechel.dev/api/auth/signin-google' },
    })
    await renderView(<SettingsPage />, { user: ADMIN })
    await openCard(/^Google sign-in/)
    expect(textOf(card(/^Google sign-in/))).toContain('Not set up')
    expect(textOf(card(/^Google sign-in/))).toContain('2 emails allowed')
  })
})
