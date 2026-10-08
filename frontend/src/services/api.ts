/**
 * The single entry point for every backend call. Components never call `fetch` or axios directly:
 *
 *   import { api } from '../services/api'
 *   const firstName = await api.profile.getFirstName()
 *
 * Add new endpoints to the matching feature group below (or a new group), mirroring the
 * backend's `Features/<Feature>` folders.
 */

import axios, { isAxiosError, type AxiosRequestConfig } from 'axios'

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

export interface SendMessageRequest {
  name: string
  email: string
  message: string
}

export interface ContactMessageSummary {
  id: number
  name: string
  /** ISO 8601 timestamp. */
  receivedAt: string
  isRead: boolean
}

export interface ContactMessageDetails {
  id: number
  name: string
  email: string
  message: string
  /** ISO 8601 timestamp. */
  receivedAt: string
  /** ISO 8601 timestamp, or null while unread. */
  readAt: string | null
}

export interface Page<T> {
  items: T[]
  /** 1-based. */
  page: number
  pageSize: number
  totalCount: number
}

export interface AboutContent {
  /** Empty: show a placeholder. */
  photoUrl: string
  links: AboutLinks
  skills: Skill[]
  /** Newest first (the API sorts on save). */
  experience: ExperienceItem[]
  /** Newest first (the API sorts on save). */
  education: EducationItem[]
  papers: string[]
  qualifications: string[]
}

/** Empty strings hide the link. */
export interface AboutLinks {
  resumeUrl: string
  gitHubUrl: string
  linkedInUrl: string
  instagramUrl: string
}

export interface Skill {
  name: string
  /** 0 to 100. */
  level: number
}

export interface ExperienceItem {
  title: string
  company: string
  location: string
  /** First of a month, "YYYY-MM-01". May be in the future. */
  start: string
  /** First of a month, or null while ongoing. */
  end: string | null
  bullets: string[]
}

export interface EducationItem {
  /** The degree or course. */
  title: string
  institution: string
  location: string
  start: string
  end: string | null
}

/** Field errors of a 400 response, keyed by camelCase field name (ASP.NET Core ValidationProblem). */
export type ValidationErrors = Record<string, string[]>

// ---------- HTTP plumbing ----------

export class ApiError extends Error {
  /** HTTP status, or 0 when no response arrived (network error). */
  readonly status: number
  /** Field errors, when the API rejected the request body (400 ValidationProblem). */
  readonly validationErrors: ValidationErrors | null

  constructor(path: string, status: number, validationErrors: ValidationErrors | null = null) {
    super(`Request to ${path} failed with status ${status}`)
    this.status = status
    this.validationErrors = validationErrors
  }
}

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
})

// Every HTTP error leaves this module as an ApiError, so callers never depend on axios.
// Cancellations (AbortSignal) are rethrown as they are.
http.interceptors.response.use(undefined, (error: unknown) => {
  if (isAxiosError(error) && !axios.isCancel(error)) {
    throw new ApiError(error.config?.url ?? '', error.response?.status ?? 0, readValidationErrors(error.response?.data))
  }
  throw error
})

function readValidationErrors(body: unknown): ValidationErrors | null {
  if (typeof body !== 'object' || body === null || !('errors' in body)) return null
  const { errors } = body as { errors: unknown }
  return typeof errors === 'object' && errors !== null ? (errors as ValidationErrors) : null
}

async function get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.get<T>(path, config)
  return response.data
}

async function post<T = void>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.post<T>(path, body, config)
  return response.data
}

// ---------- Endpoints ----------

export const api = {
  about: {
    /** Public. Placeholder content until the admin first saves the page. */
    get(signal?: AbortSignal): Promise<AboutContent> {
      return get<AboutContent>('/api/about', { signal })
    },

    /**
     * Admin only. Replaces the whole page; resolves with it as stored (trimmed, sorted).
     * Rejects with an ApiError whose `validationErrors` are keyed by path, e.g. "experience[0].title".
     */
    async update(content: AboutContent): Promise<AboutContent> {
      const response = await http.put<AboutContent>('/api/about', content)
      return response.data
    },
  },

  auth: {
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
  },

  contact: {
    /** Public. Rejects with an ApiError carrying `validationErrors` when a field is invalid. */
    async send(message: SendMessageRequest): Promise<void> {
      await post('/api/contact', message)
    },

    /** Admin only. Newest first. */
    listMessages(page = 1, pageSize = 10, signal?: AbortSignal): Promise<Page<ContactMessageSummary>> {
      return get<Page<ContactMessageSummary>>('/api/contact/messages', { params: { page, pageSize }, signal })
    },

    /** Admin only. Doesn't mark the message as read: call `markAsRead` for that. */
    getMessage(id: number, signal?: AbortSignal): Promise<ContactMessageDetails> {
      return get<ContactMessageDetails>(`/api/contact/messages/${id}`, { signal })
    },

    /** Admin only. Idempotent. */
    async markAsRead(id: number): Promise<void> {
      await post(`/api/contact/messages/${id}/read`)
    },
  },

  profile: {
    async getFirstName(signal?: AbortSignal): Promise<string> {
      const { firstName } = await get<FirstNameResponse>('/api/firstname', { signal })
      return firstName
    },
  },
}
