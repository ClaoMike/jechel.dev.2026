import { useSyncExternalStore } from 'react'

/** Whether a CSS media query matches now; re-renders when that changes. False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener?.('change', listener)
      return () => list?.removeEventListener?.('change', listener)
    },
    () => window.matchMedia?.(query).matches ?? false,
  )
}

/** Phones and very narrow windows: where the header's buttons go icon-only (app/styles/index.css uses the same width). */
export const NARROW = '(max-width: 640px)'
