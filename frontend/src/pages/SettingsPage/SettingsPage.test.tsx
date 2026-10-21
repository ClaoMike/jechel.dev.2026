import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError } from '../../services/api'
import { stubApi } from '../../test/api'
import { settings } from '../../test/fixtures/settings'
import { ADMIN, renderView, textOf } from '../../test/render'
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
