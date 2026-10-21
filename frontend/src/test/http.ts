import { vi } from 'vitest'

/** A request the code under test sent. */
export interface SentRequest {
  method: string
  /** As sent, e.g. "/api/youtube/videos?page=2&pageSize=9". */
  url: string
  headers: Record<string, string>
  body: unknown
}

/** How the fake server answers: a status and JSON body, a network failure (no answer at all), or never. */
export type Answer = { status: number; body?: unknown; headers?: Record<string, string> } | 'network-error' | 'never'

/**
 * Stands in for the network, below axios: replaces XMLHttpRequest (what axios uses in browsers), so the
 * real `api` functions run, from building the request to turning failures into ApiErrors, and nothing
 * leaves the browser. `answer` decides each response; every request is kept in `requests`.
 * Undone after each test (setup.ts).
 */
export function fakeHttp(answer: (request: SentRequest) => Answer) {
  const requests: SentRequest[] = []

  class FakeXMLHttpRequest {
    readyState = 0
    status = 0
    statusText = ''
    responseText = ''
    response: unknown = null
    responseType = ''
    responseURL = ''
    timeout = 0
    withCredentials = false
    upload = { addEventListener() {} }
    onloadend: (() => void) | null = null
    onerror: ((event: ProgressEvent) => void) | null = null
    onabort: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onreadystatechange: (() => void) | null = null
    private request: SentRequest = { method: 'GET', url: '', headers: {}, body: undefined }
    private responseHeaders: Record<string, string> = {}

    open(method: string, url: string) {
      this.request = { method: method.toUpperCase(), url, headers: {}, body: undefined }
      this.readyState = 1
    }

    setRequestHeader(name: string, value: string) {
      this.request.headers[name] = value
    }

    getAllResponseHeaders() {
      return Object.entries(this.responseHeaders)
        .map(([name, value]) => `${name}: ${value}`)
        .join('\r\n')
    }

    addEventListener() {}

    abort() {
      this.onabort?.()
    }

    send(body?: unknown) {
      this.request.body = typeof body === 'string' ? JSON.parse(body) : body
      requests.push(this.request)
      const reply = answer(this.request)
      if (reply === 'never') return
      // Answered later, as a server would.
      setTimeout(() => {
        if (reply === 'network-error') {
          this.onerror?.(new ProgressEvent('error'))
          return
        }
        this.status = reply.status
        this.statusText = String(reply.status)
        this.responseHeaders = { 'content-type': 'application/json', ...reply.headers }
        this.responseText = reply.body === undefined ? '' : JSON.stringify(reply.body)
        this.response = this.responseText
        this.readyState = 4
        this.onloadend?.()
      })
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  return { requests }
}
