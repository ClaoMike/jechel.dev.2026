import { useSyncExternalStore } from 'react'
import { setRequestPreview, type RequestPreview } from '../../services/api'

/**
 * The admin's preview switch: see the whole site as it looks while loading, or when loading fails.
 * It works where every request goes through (services/api.ts): "loading" holds content requests
 * until the page is left, "error" fails them with a 500. Sign-in and saving are never touched.
 * Remembered for this tab, and only applied while signed in.
 */
export type PreviewMode = RequestPreview

export const PREVIEW_MODES: readonly PreviewMode[] = ['normal', 'loading', 'error']

const STORAGE_KEY = 'preview.mode'
const listeners = new Set<() => void>()
let mode: PreviewMode = read()

function read(): PreviewMode {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    return PREVIEW_MODES.includes(stored as PreviewMode) ? (stored as PreviewMode) : 'normal'
  } catch {
    return 'normal'
  }
}

export function setPreviewMode(next: PreviewMode) {
  mode = next
  try {
    if (next === 'normal') sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not remembered, but still on for now.
  }
  for (const listener of listeners) listener()
}

export function usePreviewMode(): PreviewMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => mode,
  )
}

/** Applies the switch to requests: only for the signed-in admin. */
export function applyPreview(active: PreviewMode) {
  setRequestPreview(active)
}
