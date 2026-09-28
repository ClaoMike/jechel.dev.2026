/**
 * The single entry point for every backend call. Components never call `fetch` directly:
 *
 *   import { api } from '../services/api'
 *   const firstName = await api.profile.getFirstName()
 *
 * Add new endpoints to the matching feature group below (or a new group), mirroring the
 * backend's `Features/<Feature>` folders.
 */

// Empty by default: the app calls `/api/...` on its own origin (Vite proxies it to the API in dev).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

// ---------- Types (mirror the backend's response records) ----------

export interface CurrentUser {
  email: string
  name: string | null
  pictureUrl: string | null
  /** Seconds until the session ends unless there is activity. */
  sessionExpiresInSeconds: number
}

interface FirstNameResponse {
  firstName: string
}

// ---------- HTTP plumbing ----------

export class ApiError extends Error {
  readonly status: number

  constructor(path: string, status: number) {
    super(`Request to ${path} failed with status ${status}`)
    this.status = status
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init.headers },
  })

  if (!response.ok) {
    throw new ApiError(path, response.status)
  }

  return response
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { signal })
  return (await response.json()) as T
}

async function post(path: string): Promise<void> {
  await request(path, { method: 'POST' })
}

// ---------- Endpoints ----------

export const api = {
  auth: {
    /**
     * The signed-in user, or null when not signed in.
     * Like any request with the session cookie, this counts as activity and extends the session.
     */
    async me(signal?: AbortSignal): Promise<CurrentUser | null> {
      try {
        return await get<CurrentUser>('/api/auth/me', signal)
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
  },

  profile: {
    async getFirstName(signal?: AbortSignal): Promise<string> {
      const { firstName } = await get<FirstNameResponse>('/api/firstname', signal)
      return firstName
    },
  },
}
