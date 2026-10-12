import { api, ApiError, onRequestFailed, type FailedRequest, type VisitBatch, type VisitEventInput, type VisitEventType, type VisitInfo } from '../../services/api'

/**
 * Records what a visit does, to see how the site is used and to replay what led to an error:
 * pages opened, clicks (the label of what was clicked, never what was typed), Escape, the site's own
 * events (e.g. "Message sent") and every error: script errors, crashes, failed requests and files
 * that didn't load. No cookies: the visit's id lives in sessionStorage, so it ends with the tab.
 *
 * Events wait until the sign-in check is done: the signed-in admin is never recorded. Then they go
 * to the API in batches every few seconds, and when the tab is hidden or closed (sendBeacon).
 */

export type TrackerMode = 'waiting' | 'on' | 'off'

/** The event sent when the visitor picks another theme (the API counts these: AnalyticsRules.ThemeChangedEvent). */
export const THEME_CHANGED = 'Theme changed'

export interface TrackerTransport {
  send(batch: VisitBatch): Promise<void>
  /** For a closing tab. False when the browser wouldn't take it. */
  beacon(batch: VisitBatch): boolean
}

const SESSION_KEY = 'analytics.session'
export const FLUSH_DELAY_MS = 5000
const MAX_BATCH = 50
/** A closing tab's beacon is limited to 64 KB, so it goes in smaller pieces. */
const MAX_BEACON_BATCH = 15
/** Kept while waiting for the sign-in check or while the API is unreachable; the oldest go first. */
const MAX_QUEUE = 500
/** Per page load, so a loop can't flood the API. */
const MAX_EVENTS = 1000
/** The same error over and over (a render loop) is recorded this many times per page load. */
const MAX_SAME_ERROR = 5
const LABEL_MAX = 120
const STACK_MAX = 3000

const INTERACTIVE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(',')

interface Pending extends Omit<VisitEventInput, 'ageMs'> {
  /** performance.now() when it happened. */
  at: number
}

export function createTracker(transport: TrackerTransport = api.analytics) {
  let mode: TrackerMode = 'waiting'
  let queue: Pending[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let sending = false
  let failures = 0
  let recorded = 0
  let lastPageview: string | null = null
  let entryPath: string | null = null
  // Taken with the first event: main.tsx sets the theme after this module loads, and before the first render.
  let startTheme: string | null = null
  const errorCounts = new Map<string, number>()
  const session = loadSession()

  function currentPath() {
    return lastPageview ?? location.pathname + location.search
  }

  function record(type: VisitEventType, label?: string, detail?: Record<string, string>, path = currentPath()) {
    if (mode === 'off' || recorded >= MAX_EVENTS) return
    startTheme ??= document.documentElement.dataset.theme ?? ''
    recorded++
    session.seq++
    saveSession(session)
    queue.push({ seq: session.seq, type, path, label: label && cut(label, LABEL_MAX), detail: clean(detail), at: performance.now() })
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
    schedule()
  }

  function schedule() {
    if (mode !== 'on' || timer !== undefined || queue.length === 0) return
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, FLUSH_DELAY_MS)
  }

  function batch(events: Pending[]): VisitBatch {
    const now = performance.now()
    return {
      sessionId: session.id,
      session: visitInfo(entryPath ?? currentPath(), startTheme ?? ''),
      events: events.map(({ at, ...event }) => ({ ...event, ageMs: Math.max(0, Math.round(now - at)) })),
    }
  }

  /** Sends what's waiting, a batch at a time. A failed batch is tried again a few times, then dropped. */
  async function flush() {
    if (mode !== 'on' || sending || queue.length === 0) return
    const events = queue.splice(0, MAX_BATCH)
    sending = true
    try {
      await transport.send(batch(events))
      failures = 0
    } catch {
      if (++failures <= 3) queue.unshift(...events)
    } finally {
      sending = false
      schedule()
    }
  }

  /** The tab is going away: hand everything to the browser to send. */
  function flushNow() {
    if (mode !== 'on') return
    clearTimeout(timer)
    timer = undefined
    while (queue.length > 0) {
      const events = queue.splice(0, MAX_BEACON_BATCH)
      if (!transport.beacon(batch(events))) void transport.send(batch(events)).catch(() => {})
    }
  }

  function error(label: string, detail: Record<string, string>) {
    const seen = errorCounts.get(label) ?? 0
    if (seen >= MAX_SAME_ERROR) return
    errorCounts.set(label, seen + 1)
    record('error', label, detail)
  }

  // ---------- Listeners ----------

  function onClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null
    // A label passes the click on to its field, which is recorded then (with its ticked state).
    if (target instanceof HTMLLabelElement && target.control) return
    if (target) record('click', describe(target) || `(${target.tagName.toLowerCase()})`, clickDetail(target))
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') record('key', 'Escape')
  }

  /** Script errors (an ErrorEvent on window) and files that didn't load (an error event on the element; caught on the way down). */
  function onError(event: Event) {
    if (event instanceof ErrorEvent) {
      error(event.message || 'Script error', {
        kind: 'script',
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '',
        stack: stackOf(event.error),
      })
      return
    }
    const element = event.target
    if (element instanceof HTMLElement) {
      const tag = element.tagName.toLowerCase()
      const src = element.getAttribute('src') ?? element.getAttribute('href') ?? ''
      error(`Couldn't load ${tag === 'img' ? 'an image' : `a ${tag}`}`, { kind: 'resource', src })
    }
  }

  function onRejection(event: PromiseRejectionEvent) {
    const reason: unknown = event.reason
    if (reason instanceof DOMException && reason.name === 'AbortError') return
    // Failed requests are recorded as they fail (below), with their address.
    if (reason instanceof ApiError && (reason.status === 0 || reason.status >= 500)) return
    error(messageOf(reason), { kind: 'unhandled-rejection', stack: stackOf(reason) })
  }

  /** The API being down or failing is an error; 4xx answers are expected (validation, signed out). */
  function onFailedRequest({ method, path, status }: FailedRequest) {
    if (path.startsWith('/api/analytics') || (status !== 0 && status < 500)) return
    error(`${method} ${path} failed (${status === 0 ? 'no response' : status})`, { kind: 'request', status: String(status) })
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') flushNow()
  }

  function onPageHide() {
    record('leave')
    flushNow()
  }

  return {
    /** Starts listening to the page; returns the function that stops. */
    install(): () => void {
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('error', onError, true)
      window.addEventListener('unhandledrejection', onRejection)
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('pagehide', onPageHide)
      const unsubscribe = onRequestFailed(onFailedRequest)
      schedule()
      return () => {
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKeyDown, true)
        window.removeEventListener('error', onError, true)
        window.removeEventListener('unhandledrejection', onRejection)
        document.removeEventListener('visibilitychange', onVisibilityChange)
        window.removeEventListener('pagehide', onPageHide)
        unsubscribe()
        clearTimeout(timer)
        timer = undefined
      }
    },

    /** Waiting until the sign-in check is done; on for visitors; off (and forgetting) for the admin. */
    setMode(next: TrackerMode) {
      mode = next
      if (mode === 'off') {
        queue = []
        clearTimeout(timer)
        timer = undefined
      }
      schedule()
    },

    /** A page opened (path with its query). The same page twice in a row counts once. */
    pageview(path: string) {
      if (path === lastPageview) return
      entryPath ??= path
      lastPageview = path
      record('pageview', undefined, undefined, path)
    },

    /** Something worth knowing happened, e.g. "Message sent". Shown in the visit's timeline and the stats. */
    event(name: string, detail?: Record<string, string>) {
      record('event', name, detail)
    },

    /** A React render crash (from createRoot's error callbacks), with the component stack. */
    reactError(reactError: unknown, componentStack: string | undefined, caught: boolean) {
      error(messageOf(reactError), {
        kind: caught ? 'react-caught' : 'react-crash',
        stack: stackOf(reactError),
        componentStack: cut((componentStack ?? '').trim(), STACK_MAX),
      })
    },

    /** Sends now instead of waiting for the timer. */
    flush,

    /** For tests and the debugging console. */
    get state() {
      return { mode, sessionId: session.id, queued: queue.map(({ at: _at, ...event }) => event) }
    },
  }
}

export type Tracker = ReturnType<typeof createTracker>

/** The site's tracker (main.tsx and <AnalyticsTracker> use it). */
export const tracker = createTracker()

/** Records something worth knowing, e.g. trackEvent('Message sent'). Only visitors are recorded. */
export function trackEvent(name: string, detail?: Record<string, string>) {
  tracker.event(name, detail)
}

// ---------- Helpers ----------

interface StoredSession {
  id: string
  seq: number
}

/** The tab's visit: kept across reloads (sessionStorage), new in a new tab. In memory when storage is blocked. */
function loadSession(): StoredSession {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as StoredSession | null
    if (stored && typeof stored.id === 'string' && Number.isInteger(stored.seq)) return stored
  } catch {
    // Blocked or broken: start a new one.
  }
  const session = { id: newId(), seq: 0 }
  saveSession(session)
  return session
}

function saveSession(session: StoredSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Not kept: a reload starts a new visit.
  }
}

/** A random UUID; randomUUID needs a secure context, so plain http (a phone on the LAN) builds one. */
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function visitInfo(path: string, theme: string): VisitInfo {
  return {
    path,
    referrer: document.referrer,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    theme,
    currentTheme: document.documentElement.dataset.theme ?? '',
  }
}

function cut(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function squash(text: string | null | undefined) {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function clean(detail: Record<string, string> | undefined) {
  if (!detail) return undefined
  const entries = Object.entries(detail).filter(([, value]) => value !== '')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/** What the visitor saw on it: its accessible name, else its text. Never a field's value. */
export function describe(element: Element): string {
  const aria = element.getAttribute('aria-label')
  if (aria) return squash(aria)

  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ')
    if (squash(text)) return squash(text)
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const label = element.labels?.[0]
    return squash(label?.textContent) || element.name || ('placeholder' in element ? element.placeholder : '') || ''
  }

  const text = squash(element.textContent)
  if (text) return text
  return squash(element.querySelector('img[alt]')?.getAttribute('alt')) || squash(element.getAttribute('title'))
}

function clickDetail(element: Element): Record<string, string> {
  const role = element.getAttribute('role')
  const detail: Record<string, string> = { element: element.tagName.toLowerCase() + (role ? `[role=${role}]` : '') }
  if (element instanceof HTMLInputElement) {
    detail.element += `[type=${element.type}]`
    if (element.type === 'checkbox' || element.type === 'radio') detail.checked = String(element.checked)
  }
  if (element instanceof HTMLAnchorElement && element.href) {
    const url = new URL(element.href, location.href)
    // This site's links keep their query (?page=2); other sites' lose it (it can hold tokens).
    detail.href = url.origin === location.origin ? url.pathname + url.search : url.origin + url.pathname
  }
  return detail
}

function messageOf(value: unknown) {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function stackOf(value: unknown) {
  return value instanceof Error && value.stack ? cut(value.stack, STACK_MAX) : ''
}
