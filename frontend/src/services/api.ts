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

/** Free text in the About Me page may contain links written as [text](https://…); see features/about/textLinks. */
export interface AboutContent {
  /** Empty: show a placeholder. An uploaded photo is a /api/files/… path. */
  photoUrl: string
  /** Labels shown under the photo, e.g. "Romanian citizenship" with the Romanian flag. */
  statuses: Status[]
  links: AboutLinks
  colors: AboutColors
  places: Place[]
  problemSolving: ProblemSolving
  skills: Skill[]
  /** In the order the admin chose. */
  experience: ExperienceItem[]
  /** In the order the admin chose. */
  education: EducationItem[]
  papers: Paper[]
  qualifications: Qualification[]
  languages: Language[]
  licences: Licence[]
  hackathons: Hackathon[]
}

/** A citizenship or residence label. */
export interface Status {
  text: string
  /** ISO 3166 country code ("RO", "GB"), "EU", or empty for no flag. */
  flag: string
}

export interface Paper {
  title: string
  /** The uploaded PDF (/api/files/…), or empty: the title isn't a link then. */
  fileUrl: string
}

/** A public video from my channel. */
export interface YouTubeVideo {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  publishedAt: string
  /** The video on youtube.com. */
  url: string
}

export const NEETCODE_LISTS = ['blind75', 'neetcode150', 'neetcode250'] as const
export type NeetCodeList = (typeof NEETCODE_LISTS)[number]

/** The "Problem solving" section. */
export interface ProblemSolving {
  /** Empty hides the LeetCode stats. */
  leetCodeUsername: string
  /** Completed lists, in NEETCODE_LISTS order. */
  neetCodeLists: NeetCodeList[]
}

/** A number per difficulty; `all` is their sum. */
export interface DifficultyCounts {
  all: number
  easy: number
  medium: number
  hard: number
}

export interface LeetCodeStats {
  /** As LeetCode spells it. */
  username: string
  solved: DifficultyCounts
  /** Problems on LeetCode. */
  total: DifficultyCounts
  /** When the API last got them from LeetCode (it keeps them for a few hours). */
  fetchedAt: string
}

export const LANGUAGE_LEVELS = ['native', 'fluent', 'advanced', 'intermediate', 'beginner'] as const
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number]

export interface Language {
  name: string
  level: LanguageLevel
}

export const LICENCE_CATEGORIES = ['driving', 'flying', 'boating', 'other'] as const
export type LicenceCategory = (typeof LICENCE_CATEGORIES)[number]

/** A driving, flying or boating licence; see features/about/licences for the ones offered. */
export interface Licence {
  category: LicenceCategory
  /** Short code, e.g. "B" or "PPL(A)"; may be empty. */
  code: string
  /** What it allows, e.g. "Car". */
  name: string
}

export interface Hackathon {
  /** May contain links. */
  name: string
  year: number
  bullets: string[]
}

/** Empty strings hide the link. */
export interface AboutLinks {
  /** An uploaded résumé is a /api/files/… path. */
  resumeUrl: string
  gitHubUrl: string
  linkedInUrl: string
  instagramUrl: string
}

export const SKILL_USES = ['work', 'academic', 'personal'] as const
export type SkillUse = (typeof SKILL_USES)[number]

export const VISIT_KINDS = ['worked', 'studied', 'visited'] as const
export type VisitKind = (typeof VISIT_KINDS)[number]

/** Legend colours, "#rrggbb". */
export interface AboutColors {
  skills: Record<SkillUse, string>
  places: Record<VisitKind, string>
}

export interface Skill {
  name: string
  /** Empty for skills saved before they had periods: shown without a bar. */
  periods: SkillPeriod[]
}

export interface SkillPeriod {
  /** First of a month, "YYYY-MM-01". */
  start: string
  /** First of a month, or null while still in use. */
  end: string | null
  /** At least one; the API stores them in SKILL_USES order. */
  uses: SkillUse[]
}

/** A city on the "Where I've been" map. */
export interface Place {
  /** GeoNames id, from the city search. */
  id: number
  name: string
  region: string
  country: string
  latitude: number
  longitude: number
  /** At least one; the API stores them in VISIT_KINDS order. */
  visits: PlaceVisit[]
}

export interface PlaceVisit {
  kind: VisitKind
  /** Optional, may contain links: "BSc at [Uni](https://…)". */
  note: string
}

export interface ExperienceItem {
  title: string
  /** May be a link: "[Acme](https://acme.example)". */
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
  /** May be a link: "[The University of Manchester](https://www.manchester.ac.uk)". */
  institution: string
  location: string
  start: string
  end: string | null
}

export interface Qualification {
  title: string
  /** Optional. */
  issuer: string
  /** First of a month, or null when not given. */
  obtained: string | null
  /** Optional, e.g. "First Class". */
  grade: string
}

/** A place from the city search. */
export interface City {
  id: number
  name: string
  region: string
  country: string
  latitude: number
  longitude: number
  population: number
}

export interface UploadedFile {
  /** Where the file is served from: put it in photoUrl or links.resumeUrl. */
  url: string
  fileName: string
}

export const APP_MEDIA_KINDS = ['image', 'video'] as const
export type AppMediaKind = (typeof APP_MEDIA_KINDS)[number]

export interface UploadedMedia extends UploadedFile {
  kind: AppMediaKind
}

/** An image or video of an app. */
export interface AppMedia {
  /** An upload (/api/files/…). */
  url: string
  kind: AppMediaKind
}

/** An app on the Apps page. */
export interface AppDetails {
  id: number
  title: string
  /** May contain [text](https://…) links. */
  description: string
  /** In the order the admin chose; the tile shows the first image. */
  media: AppMedia[]
  createdAt: string
}

export type AppRequest = Pick<AppDetails, 'title' | 'description' | 'media'>

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

/** Called as an upload goes, with the share sent so far, 0 to 1. */
export type UploadProgress = (fraction: number) => void

function upload(path: string, file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
  const form = new FormData()
  form.append('file', file)
  return post<UploadedFile>(path, form, {
    onUploadProgress: onProgress && ((event) => event.total && onProgress(event.loaded / event.total)),
  })
}

// ---------- Endpoints ----------

export const api = {
  about: {
    /** Public. Placeholder content until the admin first saves the page. */
    get(signal?: AbortSignal): Promise<AboutContent> {
      return get<AboutContent>('/api/about', { signal })
    },

    /**
     * Admin only. Replaces the whole page; resolves with it as stored (trimmed).
     * Rejects with an ApiError whose `validationErrors` are keyed by path, e.g. "experience[0].title".
     */
    async update(content: AboutContent): Promise<AboutContent> {
      const response = await http.put<AboutContent>('/api/about', content)
      return response.data
    },
  },

  files: {
    /** Admin only. A JPEG, PNG, WebP or GIF up to 15 MB; stored as a small WebP without metadata. Rejects with validationErrors.file. */
    uploadPhoto(file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
      return upload('/api/files/photo', file, onProgress)
    },

    /** Admin only. A PDF up to 20 MB. Rejects with validationErrors.file. */
    uploadResume(file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
      return upload('/api/files/resume', file, onProgress)
    },

    /** Admin only. An academic paper, as a PDF up to 200 MB. Rejects with validationErrors.file. */
    uploadPaper(file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
      return upload('/api/files/paper', file, onProgress)
    },

    /** Admin only. An image (JPEG, PNG, WebP or GIF up to 15 MB; stored as a WebP up to 1920 px) or a video (MP4, MOV or WebM up to 200 MB). */
    uploadAppMedia(file: File, onProgress?: UploadProgress): Promise<UploadedMedia> {
      return upload('/api/files/app-media', file, onProgress) as Promise<UploadedMedia>
    },
  },

  leetcode: {
    /**
     * Public. The stats of the LeetCode user set on the About Me page, or null when none is set.
     * Rejects with an ApiError: 404 when LeetCode has no such user, 503 when it can't be reached.
     */
    async get(signal?: AbortSignal): Promise<LeetCodeStats | null> {
      const response = await http.get<LeetCodeStats>('/api/leetcode', { signal })
      return response.status === 204 ? null : response.data
    },
  },

  youtube: {
    /** Public. Newest first. Rejects with a 503 ApiError when YouTube isn't set up or can't be reached. */
    listVideos(page = 1, pageSize = 9, signal?: AbortSignal): Promise<Page<YouTubeVideo>> {
      return get<Page<YouTubeVideo>>('/api/youtube/videos', { params: { page, pageSize }, signal })
    },
  },

  apps: {
    /** Public. Newest first. */
    list(page = 1, pageSize = 9, signal?: AbortSignal): Promise<Page<AppDetails>> {
      return get<Page<AppDetails>>('/api/apps', { params: { page, pageSize }, signal })
    },

    /** Admin only. Rejects with validationErrors keyed by path, e.g. "media[0].url". */
    create(app: AppRequest): Promise<AppDetails> {
      return post<AppDetails>('/api/apps', app)
    },

    /** Admin only. */
    async update(id: number, app: AppRequest): Promise<AppDetails> {
      const response = await http.put<AppDetails>(`/api/apps/${id}`, app)
      return response.data
    },

    /** Admin only. */
    async delete(id: number): Promise<void> {
      await http.delete(`/api/apps/${id}`)
    },
  },

  places: {
    /** Admin only. Cities whose name starts with the query, largest first. "manchester, england" narrows by region or country. */
    searchCities(query: string, signal?: AbortSignal): Promise<City[]> {
      return get<City[]>('/api/places/search', { params: { q: query }, signal })
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

    /** Admin only. For good. */
    async deleteMessage(id: number): Promise<void> {
      await http.delete(`/api/contact/messages/${id}`)
    },
  },

  profile: {
    async getFirstName(signal?: AbortSignal): Promise<string> {
      const { firstName } = await get<FirstNameResponse>('/api/firstname', { signal })
      return firstName
    },
  },
}
