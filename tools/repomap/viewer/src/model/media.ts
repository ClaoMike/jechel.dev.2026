import { useSyncExternalStore } from 'react'

/** Phones and small tablets: drawer filters, bottom-sheet details, compact top bar. */
export const NARROW = '(max-width: 820px)'
/** Touch screens: bigger targets, long-press instead of right-click. */
export const COARSE = '(pointer: coarse)'
/** The system asks for less motion: no camera flights, no flowing particles. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => matches(query),
    () => false,
  )
}
