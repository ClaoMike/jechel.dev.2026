// Empty by default: the app calls `/api/...` on its own origin (Vite proxies it to the API in dev).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  readonly status: number

  constructor(path: string, status: number) {
    super(`Request to ${path} failed with status ${status}`)
    this.status = status
  }
}

async function request(path: string, init: RequestInit): Promise<Response> {
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

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { signal })
  return (await response.json()) as T
}

export async function post(path: string): Promise<void> {
  await request(path, { method: 'POST' })
}
