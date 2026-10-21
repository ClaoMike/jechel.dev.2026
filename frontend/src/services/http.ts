/**
 * The plumbing under every backend call (services/endpoints): one axios instance, failures turned into
 * ApiErrors, failure listeners, and the admin's preview switch. Only services/ uses it; the app goes
 * through `api` (services/api.ts).
 */

import axios, { AxiosError, CanceledError, isAxiosError, type AxiosRequestConfig } from 'axios'

// Empty by default: the app calls `/api/...` on its own origin (Vite proxies it to the API in dev).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export interface Page<T> {
  items: T[]
  /** 1-based. */
  page: number
  pageSize: number
  totalCount: number
}

/** Field errors of a 400 response, keyed by camelCase field name (ASP.NET Core ValidationProblem). */
export type ValidationErrors = Record<string, string[]>

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

/**
 * An ApiError as plain data, the way the Redux store keeps it (state must be serializable): what
 * RTK Query hooks report in `error`, and what `.unwrap()` on a mutation rejects with.
 */
export interface ApiFailure {
  /** HTTP status, or 0 when no response arrived (network error). */
  status: number
  validationErrors: ValidationErrors | null
}

/** Any failure (an ApiError, an ApiFailure from the store, anything else) as an ApiFailure; status 0 when it isn't an HTTP one. */
export function failureOf(error: unknown): ApiFailure {
  if (error instanceof ApiError) return { status: error.status, validationErrors: error.validationErrors }
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    const { validationErrors } = error as Partial<ApiFailure>
    return { status: error.status, validationErrors: validationErrors ?? null }
  }
  return { status: 0, validationErrors: null }
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
})

/** The admin's preview switch (features/preview): how content requests behave. */
export type RequestPreview = 'normal' | 'loading' | 'error'

let requestPreview: RequestPreview = 'normal'
/** The requests "loading" is holding: let go (as cancelled) when the switch changes. */
const heldRequests = new Set<() => void>()

/** "loading" holds GET requests until they're cancelled; "error" fails them with a 500. Never sign-in, never writes. */
export function setRequestPreview(preview: RequestPreview) {
  requestPreview = preview
  for (const release of heldRequests) release()
  heldRequests.clear()
}

const sendRequest = axios.getAdapter(http.defaults.adapter)

http.defaults.adapter = (config) => {
  const previewed = requestPreview !== 'normal' && (config.method ?? 'get').toLowerCase() === 'get' && !config.url?.startsWith('/api/auth/')
  if (!previewed) return sendRequest(config)

  if (requestPreview === 'error') {
    const response = { data: { title: 'Preview: an error' }, status: 500, statusText: 'Preview error', headers: {}, config }
    return Promise.reject(new AxiosError('Preview: the request failed', AxiosError.ERR_BAD_RESPONSE, config, null, response))
  }
  // Loading: never answers; an aborted signal, or the switch changing, ends it like any cancelled request.
  return new Promise((_, reject) => {
    const release = () => reject(new CanceledError(undefined, undefined, config))
    heldRequests.add(release)
    const signal = config.signal as AbortSignal | undefined
    signal?.addEventListener?.('abort', release)
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

export async function get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.get<T>(path, config)
  return response.data
}

export async function post<T = void>(path: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.post<T>(path, body, config)
  return response.data
}
