import { useSyncExternalStore } from 'react'

/** The site's colour themes. R* is dark glass over the animated Riviera scene. */
export const THEMES = ['dark', 'light', 'rstar'] as const

export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'theme'
const listeners = new Set<() => void>()

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme)
}

/** The visitor's last choice, or R* for first-time visitors. Storage can be missing or blocked (private windows). */
export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : 'rstar'
  } catch {
    return 'rstar'
  }
}

/** The theme on show: <html data-theme> (set in main.tsx before the first render), else the stored one. */
function currentTheme(): Theme {
  const shown = document.documentElement.dataset.theme
  return isTheme(shown) ? shown : storedTheme()
}

/** Shows the theme (glass.css keys off <html data-theme>), remembers it, and tells useTheme() users. */
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not remembered; the page still switches.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current theme; re-renders when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme)
}
