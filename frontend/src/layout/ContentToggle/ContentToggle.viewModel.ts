import { useEffect, useRef, useState } from 'react'
import { NARROW, useMediaQuery } from '../useMediaQuery'

/** How long without the pointer moving (or a key) before the button and the cursor fade away. */
export const IDLE_MS = 5000

const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export interface ContentToggleProps {
  hidden: boolean
  onToggle: () => void
  /** On phones, where the button sits in the header while the page shows. */
  slot?: HTMLElement | null
}

export function useContentToggleViewModel({ hidden, onToggle, slot }: ContentToggleProps) {
  const [idle, setIdle] = useState(false)
  const narrow = useMediaQuery(NARROW)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Moving between the header and the corner makes a new button: one that had focus hands it on.
  const refocus = useRef(false)

  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    buttonRef.current?.focus()
  }, [hidden])

  useEffect(() => {
    if (!hidden) return
    let timer = setTimeout(() => setIdle(true), IDLE_MS)
    const wake = (event: Event) => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), IDLE_MS)
      if (event instanceof KeyboardEvent && event.key === 'Escape') onToggle()
    }
    ACTIVITY.forEach((type) => window.addEventListener(type, wake, { passive: true }))
    document.documentElement.classList.add('content-hidden')
    return () => {
      clearTimeout(timer)
      ACTIVITY.forEach((type) => window.removeEventListener(type, wake))
      document.documentElement.classList.remove('content-hidden')
      setIdle(false)
    }
  }, [hidden, onToggle])

  useEffect(() => {
    document.documentElement.classList.toggle('scene-idle', idle)
    return () => document.documentElement.classList.remove('scene-idle')
  }, [idle])

  const compact = narrow && slot != null
  // While the page is hidden, a phone's button waits in the bottom-right corner, within thumb's reach.
  const cornered = compact && hidden
  return {
    hidden,
    compact,
    buttonRef,
    container: compact && !cornered ? slot : null,
    label: hidden ? 'Show page' : 'Hide page',
    className: `button button-secondary content-toggle${compact ? ' content-toggle-compact' : ''}${cornered ? ' content-toggle-cornered' : ''}${idle ? ' content-toggle-idle' : ''}`,
    toggle: () => {
      refocus.current = document.activeElement === buttonRef.current
      onToggle()
    },
  }
}
