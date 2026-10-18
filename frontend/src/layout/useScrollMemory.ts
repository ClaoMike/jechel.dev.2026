import { useEffect, useLayoutEffect } from 'react'
import { useLocation } from 'react-router'

const STORAGE_KEY = 'scroll.positions'

/** How long to keep trying to reach a remembered position while the page's content loads. */
export const RESTORE_FOR_MS = 2000

function load(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

const positions = load()

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // Remembered for this page view only.
  }
}

/**
 * Each page remembers how far down it was scrolled (for this tab, by path): a page not seen yet
 * starts at the top, and coming back to one returns to where it was. Its content may still be
 * loading, so the position is tried again as the page grows, until it's reached, the time is up, or
 * the visitor scrolls themselves.
 */
export function useScrollMemory() {
  const { pathname } = useLocation()

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    const target = positions[pathname] ?? 0
    let done = false
    const attempt = () => {
      if (done) return
      window.scrollTo(0, target)
      if (Math.abs(window.scrollY - target) < 2) stop()
    }
    const stop = () => {
      done = true
      observer?.disconnect()
      window.clearTimeout(timer)
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(type, stop)
    }
    // The visitor taking over ends it.
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(type, stop, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(attempt)
    observer?.observe(document.body)
    const timer = window.setTimeout(stop, RESTORE_FOR_MS)
    attempt()

    const remember = () => {
      positions[pathname] = Math.round(window.scrollY)
      save()
    }
    window.addEventListener('scroll', remember, { passive: true })
    return () => {
      stop()
      window.removeEventListener('scroll', remember)
    }
  }, [pathname])
}
