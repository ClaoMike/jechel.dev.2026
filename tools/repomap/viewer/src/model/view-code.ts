/** The view as a URL-safe string (base64url of its JSON). Pure, so it runs in tests too. */
import type { ColorBy } from './colors.ts'
import type { FilterState } from './filters.ts'

export interface ViewState {
  preset?: string
  filters?: Partial<FilterState>
  selected?: string
  colorBy?: ColorBy
  labels?: 'auto' | 'all' | 'none'
}

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
