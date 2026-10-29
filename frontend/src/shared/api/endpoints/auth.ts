/** Signing in with Google (admin only) and the session. */

import { API_BASE_URL, ApiError, get, http, post } from '../http'

export interface CurrentUser {
  email: string
  name: string | null
  pictureUrl: string | null
  /** Seconds until the session ends unless there is activity (never past its 12-hour limit). */
  sessionExpiresInSeconds: number
}

/** A device signed in as the admin (Settings → Signed-in devices). */
export interface AdminSession {
  id: string
  /** E.g. "Chrome on macOS". */
  device: string
  deviceType: 'desktop' | 'mobile' | 'tablet'
  ipAddress: string | null
  /** Two letters, e.g. "GB", when known. */
  country: string | null
  /** ISO 8601 timestamps: signed in, last active (to the minute), and when it ends at the latest. */
  createdAt: string
  lastSeenAt: string
  endsAt: string
  /** This device. */
  current: boolean
}

export const authEndpoints = {
  /**
   * The signed-in user, or null when not signed in.
   * Like any request with the session cookie, this counts as activity and extends the session.
   */
  async me(signal?: AbortSignal): Promise<CurrentUser | null> {
    try {
      return await get<CurrentUser>('/api/auth/me', { signal })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },

  /** Signs out this device (others stay signed in). */
  logout(): Promise<void> {
    return post('/api/auth/logout')
  },

  /** Admin only. Every device signed in, the most recently active first. */
  listSessions(signal?: AbortSignal): Promise<AdminSession[]> {
    return get<AdminSession[]>('/api/auth/sessions', { signal })
  },

  /** Admin only. Signs one device out. Rejects with a 404 ApiError when it's already signed out. */
  async endSession(id: string): Promise<void> {
    await http.delete(`/api/auth/sessions/${id}`)
  },

  /** Admin only. Signs out every device but this one; resolves with how many. */
  async endOtherSessions(): Promise<number> {
    const { count } = await post<{ count: number }>('/api/auth/sessions/end-others')
    return count
  },

  /** Not a fetch: the browser navigates here to start the Google sign-in flow. */
  googleLoginUrl(returnUrl = '/'): string {
    return `${API_BASE_URL}/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
  },
}
