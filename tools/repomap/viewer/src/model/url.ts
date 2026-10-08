/**
 * View state in the URL hash (shareable links, back/forward) plus the last view in localStorage.
 * Only differences from the defaults are stored.
 */
import { decodeView, encodeView, type ViewState } from './view-code.ts'

export { decodeView, encodeView, type ViewState }

const STORAGE_KEY = 'repomap.view'

function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

/** A parameter of the URL hash (#tab=git&commit=…&view=…). */
export function readHashParam(name: string): string | null {
  return hashParams().get(name)
}

/** Sets (or, with null, removes) hash parameters and keeps the others, without a history entry. */
export function writeHashParams(values: Record<string, string | null | undefined>): void {
  const params = hashParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') params.delete(key)
    else params.set(key, value)
  }
  const text = params.toString()
  const hash = text ? `#${text}` : ''
  if (window.location.hash.replace(/^#$/, '') !== hash) {
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${hash}`)
  }
}

export function readViewFromHash(): ViewState | null {
  const text = readHashParam('view')
  return text ? decodeView(text) : null
}

export function writeViewToHash(view: ViewState): void {
  const empty = Object.values(view).every((v) => v === undefined)
  writeHashParams({ view: empty ? null : encodeView(view) })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view))
  } catch {
    // Storage can be unavailable (private mode); the hash still works.
  }
}

export function readStoredView(): ViewState | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    return text ? (JSON.parse(text) as ViewState) : null
  } catch {
    return null
  }
}

export function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(`repomap.${key}`) as T | null) ?? fallback
  } catch {
    return fallback
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`repomap.${key}`, value)
  } catch {
    // ignore
  }
}
