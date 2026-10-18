/**
 * The single entry point for every backend call. Components never call `fetch` or axios directly:
 *
 *   import { api } from '../services/api'
 *   const firstName = await api.profile.getFirstName()
 *
 * Add new endpoints to the matching feature group below (or a new group), mirroring the
 * backend's `Features/<Feature>` folders.
 */

import axios, { AxiosError, CanceledError, isAxiosError, type AxiosRequestConfig } from 'axios'

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

/** An uploaded or linked image or video, or a YouTube video (e.g. a trailer). */
export const APP_MEDIA_KINDS = ['image', 'video', 'youtube'] as const
export type AppMediaKind = (typeof APP_MEDIA_KINDS)[number]

export interface UploadedMedia extends UploadedFile {
  kind: 'image' | 'video'
}

/** An image or video of an app. */
export interface AppMedia {
  /** An upload (/api/files/…), an http(s) link elsewhere, or for YouTube the video's watch link. */
  url: string
  kind: AppMediaKind
}

/** A kind of app the admin defined, e.g. "Mobile app". */
export interface AppCategory {
  id: number
  name: string
}

/** Where to get an app: shown as "Check it on {label}". */
export interface AppLink {
  /** E.g. "App Store", "Google Play", "Steam". */
  label: string
  /** An http(s) link. */
  url: string
}

/** An app on the Apps page. */
export interface AppDetails {
  id: number
  title: string
  /** May contain [text](https://…) links. */
  description: string
  /** Shown as labels under the title, in the categories' order. */
  categories: AppCategory[]
  /** What it runs on, e.g. "iOS"; shown in the popup only. */
  platforms: string[]
  links: AppLink[]
  /** In the order the admin chose; the tile shows the first image. */
  media: AppMedia[]
  createdAt: string
}

export interface AppRequest {
  title: string
  description: string
  categoryIds: number[]
  platforms: string[]
  links: AppLink[]
  media: AppMedia[]
}

/** One category in the admin's list; no id means a new one. */
export interface AppCategoryRequest {
  id: number | null
  name: string
}

/** The terms and conditions. Free text may contain [text](https://…) links. */
export interface TermsContent {
  title: string
  /** Shown before the sections; may be empty. */
  intro: string
  /** Numbered 1, 2, 3… in this order. */
  sections: TermsSection[]
}

export interface TermsSection {
  heading: string
  /** Paragraphs and bullet lists, in order. */
  blocks: TermsBlock[]
}

export const TERMS_BLOCK_KINDS = ['paragraph', 'bullets'] as const
export type TermsBlockKind = (typeof TERMS_BLOCK_KINDS)[number]

/** A paragraph (`text`) or a bullet list (`items`); the API empties the other one. */
export interface TermsBlock {
  kind: TermsBlockKind
  text: string
  items: string[]
}

export interface TermsDocument extends TermsContent {
  /** ISO 8601 timestamp of the last change, or null for the default terms (never saved). */
  updatedAt: string | null
}

/** Field errors of a 400 response, keyed by camelCase field name (ASP.NET Core ValidationProblem). */
export type ValidationErrors = Record<string, string[]>

// ---------- Analytics (features/analytics records them; the admin's Engagement tab reads them) ----------

export const VISIT_EVENT_TYPES = ['pageview', 'click', 'key', 'event', 'error', 'leave'] as const
export type VisitEventType = (typeof VISIT_EVENT_TYPES)[number]

/** Where and on what a visit started. Sizes are CSS pixels. */
export interface VisitInfo {
  path: string
  referrer: string
  language: string
  timeZone: string
  screenWidth: number
  screenHeight: number
  viewportWidth: number
  viewportHeight: number
  /** The theme the visit started in. */
  theme: string
  /** The theme on show now (the last batch's is the one the visit ended in). */
  currentTheme: string
}

export interface VisitEventInput {
  /** Counter within the visit, from 1: the API stores each number once. */
  seq: number
  type: VisitEventType
  path: string
  /** The button's text, the error message, the event's name. */
  label?: string
  /** More about it, e.g. an error's stack or a link's address. Strings only. */
  detail?: Record<string, string>
  /** How long ago it happened when sent; the API dates it with its own clock. */
  ageMs: number
}

export interface VisitBatch {
  sessionId: string
  session: VisitInfo
  events: VisitEventInput[]
}

export interface NamedCount {
  name: string
  count: number
}

/** Last hour, last 24 hours, 7 / 30 / 90 days, 12 months, 60 months, everything. */
export const ANALYTICS_RANGES = ['1h', '24h', '7d', '30d', '90d', '1y', '5y', 'all'] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

/** How much time one column of the chart covers. */
export type BucketSize = '5m' | 'hour' | 'day' | 'month' | 'year'

/** One column of the chart. Visits count when they started; page views and errors when they happened. */
export interface SeriesPoint {
  /** ISO 8601, UTC: the column's start. */
  start: string
  visitors: number
  sessions: number
  pageViews: number
  errors: number
}

export interface AnalyticsSummary {
  range: AnalyticsRange
  bucketSize: BucketSize
  /** ISO 8601: where the period starts (the first column's start). */
  from: string
  totals: {
    /** Unique per day, added up. */
    visitors: number
    sessions: number
    pageViews: number
    averageSessionSeconds: number
    /** 0 to 1: visits that saw one page and did nothing else. */
    bounceRate: number
    errors: number
  }
  /** Oldest first; the last is the current, partial one. */
  series: SeriesPoint[]
  topPages: NamedCount[]
  referrers: NamedCount[]
  devices: NamedCount[]
  browsers: NamedCount[]
  timeZones: NamedCount[]
  topClicks: NamedCount[]
  topErrors: NamedCount[]
  /** The theme visits ended in: what visitors prefer (first-time visitors start in Vice). */
  themes: NamedCount[]
  /** "vice → dark": switches made during visits. */
  themeSwitches: NamedCount[]
}

export interface VisitSummary {
  id: string
  /** ISO 8601 timestamp. */
  startedAt: string
  durationSeconds: number
  pageViews: number
  eventCount: number
  errorCount: number
  entryPath: string
  referrerHost: string | null
  device: string
  browser: string
  operatingSystem: string
  timeZone: string | null
  /** The theme the visit started in, and the one it ended in. */
  theme: string | null
  lastTheme: string | null
}

export interface VisitEvent {
  seq: number
  /** ISO 8601 timestamp. */
  occurredAt: string
  type: VisitEventType
  path: string
  label: string | null
  detail: Record<string, string> | null
}

export interface VisitDetails {
  id: string
  startedAt: string
  lastSeenAt: string
  entryPath: string
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  userAgent: string
  device: string
  browser: string
  operatingSystem: string
  country: string | null
  language: string | null
  timeZone: string | null
  screenWidth: number
  screenHeight: number
  viewportWidth: number
  viewportHeight: number
  theme: string | null
  lastTheme: string | null
  /** In the order they happened. */
  events: VisitEvent[]
}

// ---------- Support (Buy me a coffee), email updates, résumé ----------

export interface SupportInfo {
  /** Where the "Buy me a coffee" button goes; empty hides it. */
  url: string
}

export type SubscribeStatus = 'sent' | 'alreadySubscribed' | 'pending'

/** A payment Buy Me a Coffee reported (admin only). */
export interface Donation {
  id: number
  /** The event, e.g. "donation.created". */
  type: string
  fromName: string
  message: string | null
  /** As the service sent it, e.g. "3.00". */
  amount: string
  currency: string
  email: string | null
  /** ISO 8601 timestamp. */
  receivedAt: string
}

export interface Subscriber {
  id: number
  email: string
  /** ISO 8601 timestamp. */
  createdAt: string
  /** Null until they click the link in the confirmation email. */
  confirmedAt: string | null
}

/** pending: a new app waiting for the admin; approved: about to be emailed. */
export type AnnouncementStatus = 'pending' | 'approved' | 'sent' | 'ignored'

/** Something new to email the subscribers about. */
export interface Announcement {
  id: number
  kind: 'app' | 'video'
  title: string
  status: AnnouncementStatus
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp, or null until emailed. */
  sentAt: string | null
  recipientCount: number
}

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

/** The parts of About Me a résumé can include, in print order (ResumeSections.cs). */
export const RESUME_SECTIONS = [
  'statuses',
  'links',
  'experience',
  'skills',
  'education',
  'qualifications',
  'papers',
  'hackathons',
  'problemSolving',
  'languages',
  'licences',
  'places',
] as const

export type ResumeSection = (typeof RESUME_SECTIONS)[number]

/** The résumé's contact details: edited with the About Me profile, but never on the public page. */
export interface ResumeContact {
  /** Private: only in the admin's copy. */
  phone: string
  email: string
  /** Under the name, e.g. "Full-stack engineer · .NET, React, PostgreSQL". */
  headline: string
}

/** What the generator puts in. */
export interface ResumeChoices {
  sections: ResumeSection[]
  /** Names of the About Me skills to leave out. */
  excludedSkills: string[]
}

export interface ResumeSettingsDetails extends ResumeContact, ResumeChoices {
  /** ISO 8601 timestamp of the last generation, or null before the first. */
  generatedAt: string | null
}

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

/** The admin's preview switch (features/preview): how content requests behave. */
export type RequestPreview = 'normal' | 'loading' | 'error'

let requestPreview: RequestPreview = 'normal'

/** "loading" holds GET requests until they're cancelled; "error" fails them with a 500. Never sign-in, never writes. */
export function setRequestPreview(preview: RequestPreview) {
  requestPreview = preview
}

const sendRequest = axios.getAdapter(http.defaults.adapter)

http.defaults.adapter = (config) => {
  const previewed = requestPreview !== 'normal' && (config.method ?? 'get').toLowerCase() === 'get' && !config.url?.startsWith('/api/auth/')
  if (!previewed) return sendRequest(config)

  if (requestPreview === 'error') {
    const response = { data: { title: 'Preview: an error' }, status: 500, statusText: 'Preview error', headers: {}, config }
    return Promise.reject(new AxiosError('Preview: the request failed', AxiosError.ERR_BAD_RESPONSE, config, null, response))
  }
  // Loading: never answers; leaving the page (an aborted signal) ends it like any cancelled request.
  return new Promise((_, reject) => {
    const signal = config.signal as AbortSignal | undefined
    signal?.addEventListener?.('abort', () => reject(new CanceledError(undefined, undefined, config)))
  })
}

/** A request that failed, as told to `onRequestFailed` listeners. */
export interface FailedRequest {
  method: string
  path: string
  /** HTTP status, or 0 when no response arrived. */
  status: number
}

const failedRequestListeners = new Set<(request: FailedRequest) => void>()

/** Tells `listener` about every request that fails (not cancelled ones), e.g. to record it. Returns the unsubscribe. */
export function onRequestFailed(listener: (request: FailedRequest) => void): () => void {
  failedRequestListeners.add(listener)
  return () => failedRequestListeners.delete(listener)
}

// Every HTTP error leaves this module as an ApiError, so callers never depend on axios.
// Cancellations (AbortSignal) are rethrown as they are.
http.interceptors.response.use(undefined, (error: unknown) => {
  if (isAxiosError(error) && !axios.isCancel(error)) {
    const path = error.config?.url ?? ''
    const status = error.response?.status ?? 0
    const failed = { method: (error.config?.method ?? 'get').toUpperCase(), path, status }
    for (const listener of failedRequestListeners) listener(failed)
    throw new ApiError(path, status, readValidationErrors(error.response?.data))
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

  terms: {
    /** Public. The default terms (updatedAt null) until the admin first saves them. */
    get(signal?: AbortSignal): Promise<TermsDocument> {
      return get<TermsDocument>('/api/terms', { signal })
    },

    /**
     * Admin only. Replaces the terms; resolves with them as stored (trimmed), with the new date.
     * Rejects with validationErrors keyed by path, e.g. "sections[0].blocks[1].items[2]".
     */
    async update(content: TermsContent): Promise<TermsDocument> {
      const response = await http.put<TermsDocument>('/api/terms', content)
      return response.data
    },
  },

  files: {
    /** Admin only. A JPEG, PNG, WebP or GIF up to 15 MB; stored as a small WebP without metadata. Rejects with validationErrors.file. */
    uploadPhoto(file: File, onProgress?: UploadProgress): Promise<UploadedFile> {
      return upload('/api/files/photo', file, onProgress)
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

    /** Public. In the admin's order. */
    listCategories(signal?: AbortSignal): Promise<AppCategory[]> {
      return get<AppCategory[]>('/api/apps/categories', { signal })
    },

    /**
     * Admin only. Replaces the list: ids are kept (renamed, reordered), no id adds one, and those left
     * out are deleted and taken off every app. Rejects with validationErrors keyed like "[2].name".
     */
    async saveCategories(categories: AppCategoryRequest[]): Promise<AppCategory[]> {
      const response = await http.put<AppCategory[]>('/api/apps/categories', categories)
      return response.data
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

  analytics: {
    /** Public. Records a batch of the visit's events (the API ignores the signed-in admin). */
    async send(batch: VisitBatch): Promise<void> {
      await post('/api/analytics/events', batch)
    },

    /**
     * Public. The same, for a closing tab: the browser sends it even after the page is gone.
     * False when it couldn't be queued (no sendBeacon, or too big).
     */
    beacon(batch: VisitBatch): boolean {
      if (typeof navigator.sendBeacon !== 'function') return false
      const body = new Blob([JSON.stringify(batch)], { type: 'application/json' })
      return navigator.sendBeacon(`${API_BASE_URL}/api/analytics/events`, body)
    },

    /** Admin only. The period up to now, split into the chart's columns. */
    summary(range: AnalyticsRange, signal?: AbortSignal): Promise<AnalyticsSummary> {
      return get<AnalyticsSummary>('/api/analytics/summary', { params: { range }, signal })
    },

    /** Admin only. Newest first; `errorsOnly` keeps the visits that hit an error. */
    listSessions(page = 1, pageSize = 20, errorsOnly = false, signal?: AbortSignal): Promise<Page<VisitSummary>> {
      return get<Page<VisitSummary>>('/api/analytics/sessions', { params: { page, pageSize, errorsOnly }, signal })
    },

    /** Admin only. The visit with every event in order. */
    getSession(id: string, signal?: AbortSignal): Promise<VisitDetails> {
      return get<VisitDetails>(`/api/analytics/sessions/${id}`, { signal })
    },

    /** Admin only. For good. */
    async deleteSession(id: string): Promise<void> {
      await http.delete(`/api/analytics/sessions/${id}`)
    },
  },

  support: {
    /** Public. Where the header's "Buy me a coffee" button goes. */
    get(signal?: AbortSignal): Promise<SupportInfo> {
      return get<SupportInfo>('/api/support', { signal })
    },

    /** Admin only. Newest first. */
    listDonations(page = 1, pageSize = 20, signal?: AbortSignal): Promise<Page<Donation>> {
      return get<Page<Donation>>('/api/support/donations', { params: { page, pageSize }, signal })
    },
  },

  updates: {
    /**
     * Public. Emails a confirmation link: "sent"; or nothing, when they're "alreadySubscribed" or a
     * confirmation went out lately ("pending"). Rejects with validationErrors.email, a 429 when tried
     * too often, or a 503 when the email couldn't be sent.
     */
    async subscribe(email: string): Promise<SubscribeStatus> {
      const { status } = await post<{ status: SubscribeStatus }>('/api/updates/subscribe', { email })
      return status
    },

    /** Public. The link in the confirmation email; resolves with the address. Rejects with a 404 for an unknown token. */
    async confirm(token: string): Promise<string> {
      const { email } = await post<{ email: string }>('/api/updates/confirm', undefined, { params: { token } })
      return email
    },

    /** Public. The link in every update email. */
    async unsubscribe(token: string): Promise<void> {
      await post('/api/updates/unsubscribe', undefined, { params: { token } })
    },

    /** Admin only. Newest first, confirmed or not. */
    listSubscribers(page = 1, pageSize = 20, signal?: AbortSignal): Promise<Page<Subscriber>> {
      return get<Page<Subscriber>>('/api/updates/subscribers', { params: { page, pageSize }, signal })
    },

    /** Admin only. */
    async deleteSubscriber(id: number): Promise<void> {
      await http.delete(`/api/updates/subscribers/${id}`)
    },

    /** Admin only. A pending announcement: email it (`send`) or not (`ignore`). */
    async decide(id: number, decision: 'send' | 'ignore'): Promise<AnnouncementStatus> {
      const { status } = await post<{ status: AnnouncementStatus }>(`/api/updates/announcements/${id}/${decision}`)
      return status
    },

    /** Admin only. Newest first, with whether each was emailed. */
    listAnnouncements(page = 1, pageSize = 20, signal?: AbortSignal): Promise<Page<Announcement>> {
      return get<Page<Announcement>>('/api/updates/announcements', { params: { page, pageSize }, signal })
    },
  },

  resume: {
    /** Public: the last generated résumé, without the phone number. */
    publicUrl: `${API_BASE_URL}/api/resume`,

    /** Admin only: the same résumé with the phone number. */
    privateUrl: `${API_BASE_URL}/api/resume/private`,

    /** Admin only. */
    getSettings(signal?: AbortSignal): Promise<ResumeSettingsDetails> {
      return get<ResumeSettingsDetails>('/api/resume/settings', { signal })
    },

    /** Admin only. The phone, email and headline. Rejects with validationErrors (phone, email, headline). */
    async saveContact(contact: ResumeContact): Promise<ResumeSettingsDetails> {
      const response = await http.put<ResumeSettingsDetails>('/api/resume/contact', contact)
      return response.data
    },

    /** Admin only. Saves the sections and skills without generating. */
    async saveChoices(choices: ResumeChoices): Promise<ResumeSettingsDetails> {
      const response = await http.put<ResumeSettingsDetails>('/api/resume/choices', choices)
      return response.data
    },

    /**
     * Admin only. Saves the choices, then makes both PDFs from the About Me page and the saved contact
     * details; the page's "Download résumé" button then gets the one without the phone number.
     */
    generate(choices: ResumeChoices): Promise<ResumeSettingsDetails> {
      return post<ResumeSettingsDetails>('/api/resume/generate', choices)
    },
  },

  settings: {
    /** Admin only. */
    get(signal?: AbortSignal): Promise<SettingsResponse> {
      return get<SettingsResponse>('/api/settings', { signal })
    },

    /** Admin only. Applies at once; an empty value clears it. Rejects with validationErrors.value. */
    async save(key: string, value: string): Promise<SettingsResponse> {
      const response = await http.put<SettingsResponse>(`/api/settings/${encodeURIComponent(key)}`, { value })
      return response.data
    },

    /** Admin only. Sends a test alert ("ntfy"), a test email to you ("email"), or lists the videos ("youtube"). */
    test(service: 'ntfy' | 'email' | 'youtube'): Promise<TestResult> {
      return post<TestResult>(`/api/settings/test/${service}`)
    },
  },

  profile: {
    async getFirstName(signal?: AbortSignal): Promise<string> {
      const { firstName } = await get<FirstNameResponse>('/api/firstname', { signal })
      return firstName
    },
  },
}
