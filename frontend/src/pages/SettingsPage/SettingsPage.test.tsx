import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError, type Setting, type SettingsResponse } from '../../services/api'
import { stubApi } from '../../test/api'
import { ADMIN, renderView, textOf } from '../../test/render'
import { SettingsPage } from './SettingsPage'

// Settings → Resend: one sender people can answer, and one for subscribers that takes no replies.

const setting = (key: string, label: string, value = '', isSecret = false): Setting => ({
  key,
  label,
  isSecret,
  value: isSecret ? null : value,
  isSet: value.length > 0,
  hint: isSecret && value ? value.slice(-4) : null,
  source: value ? 'settings' : 'none',
  updatedAt: null,
})

const KEYS: [string, string][] = [
  ['Support:Url', 'Page link'],
  ['Support:BuyMeACoffeeWebhookSecret', 'Webhook secret'],
  ['YouTube:Channel', 'Channel (@handle or UC… id)'],
  ['YouTube:ApiKey', 'API key'],
  ['Email:ResendApiKey', 'API key'],
  ['Email:From', 'Sender'],
  ['Email:UpdatesFrom', 'Updates sender (no replies)'],
  ['Alerts:NtfyTopic', 'Topic'],
  ['Alerts:NtfyServer', 'Server'],
  ['Alerts:NtfyToken', 'Access token (optional)'],
  ['Cal:Link', 'Booking page'],
  ['Cal:ApiKey', 'API key'],
  ['Cal:WebhookSecret', 'Webhook secret'],
]

function settings(values: Record<string, string> = {}): SettingsResponse {
  return {
    settings: KEYS.map(([key, label]) => setting(key, label, values[key] ?? '', /Key|Secret|Token/.test(key))),
    google: { isConfigured: true, clientIdHint: '1234abcd…', adminEmailCount: 1, redirectUri: 'https://jechel.dev/api/auth/signin-google' },
    siteUrl: 'https://jechel.dev',
  }
}

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
  it('has a sender for everything, and one for subscribers that takes no replies', async () => {
    stub({ 'Email:ResendApiKey': 're_123456789abcd', 'Email:From': 'jechel.dev <updates@jechel.dev>' })
    await renderView(<SettingsPage />, { user: ADMIN })
    await openResend()

    await expect.element(sender()).toHaveValue('jechel.dev <updates@jechel.dev>')
    await expect.element(updatesSender()).toHaveValue('')
    expect(updatesSender().element().getAttribute('placeholder')).toBe('jechel.dev <updates@jechel.dev>')
    expect(textOf(resend())).toContain('Use an address with no mailbox, so replies go nowhere.')
    expect(textOf(resend())).toContain("Every email's sender, unless one below is set.")
    expect(textOf(resend())).toContain('their wording is in the Community tab')
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
