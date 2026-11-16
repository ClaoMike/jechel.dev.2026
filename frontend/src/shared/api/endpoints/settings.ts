/** Settings (admin only): connection settings for the services the site uses, and testing them. */

import { get, http, post } from '../http'

/** A connection setting (Settings tab). Secrets are never sent to the browser: only whether they're set and their last 4 characters. */
export interface Setting {
  /** The configuration key, e.g. "Email:ResendApiKey". */
  key: string
  label: string
  isSecret: boolean
  /** Only for settings that aren't secret. */
  value: string | null
  isSet: boolean
  /** A secret's last 4 characters. */
  hint: string | null
  /** Where the value in use comes from: saved here, the server's configuration, or nowhere. */
  source: 'settings' | 'configuration' | 'none'
  /** ISO 8601 timestamp of the last save here. */
  updatedAt: string | null
}

export interface GoogleStatus {
  isConfigured: boolean
  clientIdHint: string | null
  adminEmailCount: number
  /** The callback to register in Google Cloud. */
  redirectUri: string
}

export interface SettingsResponse {
  settings: Setting[]
  google: GoogleStatus
  /** The site's public address, e.g. "https://jechel.dev". */
  siteUrl: string
}

export interface TestResult {
  ok: boolean
  message: string
}

export const settingsEndpoints = {
  /** Admin only. */
  get(signal?: AbortSignal): Promise<SettingsResponse> {
    return get<SettingsResponse>('/api/settings', { signal })
  },

  /** Admin only. Applies at once; an empty value clears it. Rejects with validationErrors.value. */
  async save(key: string, value: string): Promise<SettingsResponse> {
    const response = await http.put<SettingsResponse>(`/api/settings/${encodeURIComponent(key)}`, { value })
    return response.data
  },

  /** Admin only. Sends a test alert ("ntfy"), a test email to you ("email"), lists the videos ("youtube"), or checks the Cal.com key ("cal"). */
  test(service: 'ntfy' | 'email' | 'youtube' | 'cal'): Promise<TestResult> {
    return post<TestResult>(`/api/settings/test/${service}`)
  },
}
