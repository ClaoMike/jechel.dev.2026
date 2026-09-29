/**
 * View state in the URL hash (shareable links, back/forward) plus the last view in localStorage.
 * Only differences from the defaults are stored.
 */
import type { ColorBy } from './colors.ts'
import type { FilterState } from './filters.ts'

export interface ViewState {
  preset?: string
  filters?: Partial<FilterState>
  selected?: string
  colorBy?: ColorBy
  labels?: 'auto' | 'all' | 'none'
}

const STORAGE_KEY = 'repomap.view'

export function encodeView(view: ViewState): string {
  const json = JSON.stringify(view)
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeView(text: string): ViewState | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(base64)))) as ViewState
  } catch {
    return null
  }
}

export function readViewFromHash(): ViewState | null {
  const match = /(?:^#|&)view=([^&]+)/.exec(window.location.hash)
  return match ? decodeView(match[1]) : null
}

export function writeViewToHash(view: ViewState): void {
  const empty = Object.values(view).every((v) => v === undefined)
  const hash = empty ? '' : `#view=${encodeView(view)}`
  if (window.location.hash !== hash) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
  }
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
