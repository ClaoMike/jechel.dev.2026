/** Signing in with Google (admin only) and the session. */

import { API_BASE_URL, ApiError, get, post } from '../http'

export interface CurrentUser {
  email: string
  name: string | null
  pictureUrl: string | null
  /** Seconds until the session ends unless there is activity. */
  sessionExpiresInSeconds: number
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

  logout(): Promise<void> {
    return post('/api/auth/logout')
  },

  /** Not a fetch: the browser navigates here to start the Google sign-in flow. */
  googleLoginUrl(returnUrl = '/'): string {
    return `${API_BASE_URL}/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
  },
}
