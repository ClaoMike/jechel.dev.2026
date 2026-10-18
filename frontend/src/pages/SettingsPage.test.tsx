import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Setting, SettingsResponse } from '../services/api'
import { renderApp } from '../test/render'
import { API, server, signedIn } from '../test/server'

const setting = (key: string, label: string, isSecret: boolean, value = ''): Setting => ({
  key,
  label,
  isSecret,
  value: isSecret ? null : value,
  isSet: value.length > 0,
  hint: isSecret && value.length >= 12 ? value.slice(-4) : null,
  source: value ? 'configuration' : 'none',
  updatedAt: null,
})

function settingsApi() {
  const saved: { key: string; value: string }[] = []
  let response: SettingsResponse = {
    settings: [
      setting('Support:Url', 'Page link', false),
      setting('Support:BuyMeACoffeeWebhookSecret', 'Webhook secret', true),
      setting('YouTube:Channel', 'Channel (@handle or UC… id)', false, '@claomike'),
      setting('YouTube:ApiKey', 'API key', true, 'AIzaSyEXAMPLEkey9876'),
      setting('Email:ResendApiKey', 'API key', true, 're_EXAMPLEkey_abcd'),
      setting('Email:From', 'Sender', false),
      setting('Alerts:NtfyTopic', 'Topic', false),
      setting('Alerts:NtfyServer', 'Server', false),
      setting('Alerts:NtfyToken', 'Access token (optional)', true),
    ],
    google: { isConfigured: true, clientIdHint: '1234-abc…', adminEmailCount: 1, redirectUri: 'https://jechel.dev/api/auth/signin-google' },
    siteUrl: 'https://jechel.dev',
  }
  const handlers = [
    http.get(`${API}/api/settings`, () => HttpResponse.json(response)),
    http.put(`${API}/api/settings/:key`, async ({ params, request }) => {
      const { value } = (await request.json()) as { value: string }
      const key = decodeURIComponent(String(params.key))
      saved.push({ key, value })
      response = {
        ...response,
        settings: response.settings.map((s) => (s.key === key ? { ...s, value: s.isSecret ? null : value, isSet: value.length > 0, source: value ? 'settings' : 'none', hint: s.isSecret ? value.slice(-4) : null } : s)),
      }
      return HttpResponse.json(response)
    }),
    http.post(`${API}/api/settings/test/:service`, ({ params }) => HttpResponse.json({ ok: params.service === 'ntfy', message: params.service === 'ntfy' ? 'Sent.' : 'Resend refused it: domain not verified' })),
  ]
  return { handlers, saved }
}

async function renderSettings() {
  const settings = settingsApi()
  server.use(signedIn(), ...settings.handlers)
  const user = userEvent.setup()
  renderApp('/settings')
  await screen.findByRole('button', { name: /^Buy Me a Coffee/ })
  /** Opens the service's card and gives its contents. */
  const card = async (name: string) => {
    const toggle = screen.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) })
    if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle)
    return within(screen.getByRole('region', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }))
  }
  return { user, card, ...settings }
}

describe('SettingsPage', () => {
  it('sends visitors home', async () => {
    renderApp('/settings')

    await screen.findByText(/Nothing here yet/)
    expect(screen.queryByRole('button', { name: /Buy Me a Coffee/ })).not.toBeInTheDocument()
  })

  it('saves the coffee page link', async () => {
    const { user, card, saved } = await renderSettings()
    const coffee = await card('Buy Me a Coffee')

    await user.type(coffee.getByLabelText(/Page link/), 'https://buymeacoffee.com/claomike')
    await user.click(coffee.getAllByRole('button', { name: 'Save' })[0])

    expect(await coffee.findByText('Saved.')).toBeInTheDocument()
    expect(saved).toEqual([{ key: 'Support:Url', value: 'https://buymeacoffee.com/claomike' }])
    expect(coffee.getByText('https://jechel.dev/api/support/buymeacoffee')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Buy Me a Coffee/ })).toHaveTextContent('Partly set up')
  })

  it('never shows a secret, only how it ends', async () => {
    const { card } = await renderSettings()

    const resend = await card('Resend (email)')
    expect(resend.getByLabelText(/API key/)).toHaveValue('')
    expect(resend.getByText(/ends in abcd/)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(/re_EXAMPLE/)).not.toBeInTheDocument()
  })

  it('lists the services folded, each with how far it is set up', async () => {
    await renderSettings()

    const toggles = screen.getAllByRole('button', { expanded: false })
    expect(toggles.map((t) => t.textContent)).toEqual([
      'Buy Me a CoffeeNot set up',
      'Google sign-inSet up',
      'YouTube Data APISet up',
      'Resend (email)Partly set up',
      'ntfy (phone alerts)Not set up',
      'HostingLater',
    ])
  })

  it('generates an ntfy topic and sends a test alert', async () => {
    const { user, card, saved } = await renderSettings()
    const ntfy = await card('ntfy (phone alerts)')

    await user.click(ntfy.getByRole('button', { name: 'Generate' }))
    const topic = (ntfy.getByLabelText(/^Topic/) as HTMLInputElement).value
    expect(topic).toMatch(/^jechel-[0-9a-f]{24}$/)
    await user.click(ntfy.getAllByRole('button', { name: 'Save' })[0])
    await ntfy.findByText('Saved.')
    await user.click(ntfy.getByRole('button', { name: 'Send a test alert' }))

    expect(await ntfy.findByText(/Sent\./)).toBeInTheDocument()
    expect(saved[0]).toEqual({ key: 'Alerts:NtfyTopic', value: topic })
  })

  it("shows why a test failed", async () => {
    const { user, card } = await renderSettings()

    const resend = await card('Resend (email)')
    await user.click(resend.getByRole('button', { name: 'Send me a test email' }))

    expect(await resend.findByText('Resend refused it: domain not verified')).toBeInTheDocument()
  })

  it('shows how Google sign-in is set up, without letting it change', async () => {
    const { card } = await renderSettings()

    const google = await card('Google sign-in')
    expect(google.getByText(/client 1234-abc…/)).toBeInTheDocument()
    expect(google.getByText('https://jechel.dev/api/auth/signin-google')).toBeInTheDocument()
    expect(google.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
