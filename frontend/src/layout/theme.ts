import { useSyncExternalStore } from 'react'
import { isLowPowerDevice, systemTheme } from './device'

/** The site's colour themes. Vice is dark glass over the animated Riviera scene. */
export const THEMES = ['dark', 'light', 'vice'] as const

export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'theme'
/** Set once Vice turned out too slow here: later visits start in light or dark straight away. */
const SLOW_KEY = 'theme.slowDevice'
const listeners = new Set<() => void>()
const slowListeners = new Set<(theme: Theme) => void>()

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme)
}

/** The visitor's own choice, if they made one (the switch). */
export function chosenTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

/**
 * The visitor's last choice; otherwise Vice, unless this device can't show it smoothly (or showed it
 * slowly before), then the light or dark it asks for. Storage can be missing or blocked (private windows).
 */
export function storedTheme(): Theme {
  const chosen = chosenTheme()
  if (chosen) return chosen
  return wasSlow() || isLowPowerDevice() ? systemTheme() : 'vice'
}

function wasSlow(): boolean {
  try {
    return localStorage.getItem(SLOW_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Vice is drawing too slowly here. Unless the visitor chose Vice themselves, switches to their
 * light or dark (without making it their choice) and remembers it for next time. Listeners
 * (onSlowSceneSwitch) hear which theme it switched to, to say so.
 */
export function reportSlowScene() {
  if (chosenTheme() !== null) return
  try {
    localStorage.setItem(SLOW_KEY, '1')
  } catch {
    // Not remembered: next visit tries Vice again.
  }
  const theme = systemTheme()
  show(theme)
  slowListeners.forEach((listener) => listener(theme))
}

export function onSlowSceneSwitch(listener: (theme: Theme) => void): () => void {
  slowListeners.add(listener)
  return () => slowListeners.delete(listener)
}

/** The theme on show: <html data-theme> (set in main.tsx before the first render), else the stored one. */
function currentTheme(): Theme {
  const shown = document.documentElement.dataset.theme
  return isTheme(shown) ? shown : storedTheme()
}

/** Shows the theme (glass.css keys off <html data-theme>), remembers it, and tells useTheme() users. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not remembered; the page still switches.
  }
  show(theme)
}

function show(theme: Theme) {
  document.documentElement.dataset.theme = theme
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
