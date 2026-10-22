/** What the API says about the connection settings, for tests. */
import type { Setting, SettingsResponse } from '../../services/api'

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

/** Every setting the Settings tab shows (as SettingsCatalog.cs lists them). */
const KEYS: [string, string][] = [
  ['Support:Url', 'Page link'],
  ['Support:BuyMeACoffeeWebhookSecret', 'Webhook secret'],
  ['YouTube:Channel', 'Channel (@handle or UC… id)'],
  ['YouTube:ApiKey', 'API key'],
  ['Email:ResendApiKey', 'API key'],
  ['Email:From', 'Sender'],
  ['Email:UpdatesFrom', 'Updates sender (no replies)'],
  ['Email:InboundWebhookSecret', 'Receiving webhook secret'],
  ['Alerts:NtfyTopic', 'Topic'],
  ['Alerts:NtfyServer', 'Server'],
  ['Alerts:NtfyToken', 'Access token (optional)'],
  ['Cal:Link', 'Booking page'],
  ['Cal:ApiKey', 'API key'],
  ['Cal:WebhookSecret', 'Webhook secret'],
]

/** The settings, with these values set (keys with Key, Secret or Token in them are secrets). */
export function settings(values: Record<string, string> = {}): SettingsResponse {
  return {
    settings: KEYS.map(([key, label]) => setting(key, label, values[key] ?? '', /Key|Secret|Token/.test(key))),
    google: { isConfigured: true, clientIdHint: '1234abcd…', adminEmailCount: 1, redirectUri: 'https://jechel.dev/api/auth/signin-google' },
    siteUrl: 'https://jechel.dev',
  }
}
