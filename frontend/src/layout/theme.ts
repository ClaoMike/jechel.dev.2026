import { isLowPowerDevice, systemTheme } from './device'

/** The site's colour themes. Vice is dark glass over the animated Riviera scene. */
export const THEMES = ['dark', 'light', 'vice'] as const

export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'theme'
/** Set once Vice turned out too slow here: later visits start in light or dark straight away. */
const SLOW_KEY = 'theme.slowDevice'

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

/** Vice was too slow here: next visit starts in light or dark. */
export function rememberSlowDevice() {
  try {
    localStorage.setItem(SLOW_KEY, '1')
  } catch {
    // Not remembered: next visit tries Vice again.
  }
}

/** Makes it the visitor's choice. */
export function rememberTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not remembered; the page still switches.
  }
}

/** Shows the theme: glass.css keys off <html data-theme> (and the tracker reads it). */
export function showTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}
