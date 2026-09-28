import { API_BASE_URL, ApiError, getJson, post } from './client'

export interface CurrentUser {
  email: string
  name: string | null
  pictureUrl: string | null
  /** Seconds until the session ends unless there is activity. */
  sessionExpiresInSeconds: number
}

/**
 * Returns the signed-in user, or null when not signed in.
 * Like any request with the session cookie, this counts as activity and extends the session.
 */
export async function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  try {
    return await getJson<CurrentUser>('/api/auth/me', signal)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function logout(): Promise<void> {
  return post('/api/auth/logout')
}

/** Full-page navigation target that starts the Google sign-in flow. */
export function googleLoginUrl(returnUrl = '/'): string {
  return `${API_BASE_URL}/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
}
