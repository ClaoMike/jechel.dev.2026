import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import { NARROW, useMediaQuery } from '../useMediaQuery'

/** How long without the pointer moving (or a key) before the button and the cursor fade away. */
export const IDLE_MS = 5000

const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export interface ContentToggleProps {
  hidden: boolean
  onToggle: () => void
  anchor?: RefObject<HTMLElement | null>
}

export function useContentToggleViewModel({ hidden, onToggle, anchor }: ContentToggleProps) {
  const [idle, setIdle] = useState(false)
  const narrow = useMediaQuery(NARROW)
  const [place, setPlace] = useState<CSSProperties | null>(null)

  // Follows the slot while the page shows (scrolling, resizing). The header slides back in after
  // "Show page", so the slot is measured again once it has landed (transitionend, and a timer in
  // case there's no transition), not only right away, while it's still off screen.
  useLayoutEffect(() => {
    if (!narrow || hidden || !anchor) return
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (rect) setPlace({ top: rect.top, left: rect.left })
    }
    update()
    const header = anchor.current?.closest('.site-header')
    const settle = window.setTimeout(update, 700)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    header?.addEventListener('transitionend', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (anchor.current?.parentElement) observer?.observe(anchor.current.parentElement)
    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
      header?.removeEventListener('transitionend', update)
      observer?.disconnect()
    }
  }, [narrow, hidden, anchor])

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

  const compact = narrow && place !== null
  // While the page is hidden, a phone's button waits in the bottom-right corner, within thumb's reach.
  const cornered = compact && hidden
  return {
    hidden,
    compact,
    label: hidden ? 'Show page' : 'Hide page',
    className: `button button-secondary content-toggle${compact ? ' content-toggle-compact' : ''}${cornered ? ' content-toggle-cornered' : ''}${idle ? ' content-toggle-idle' : ''}`,
    style: compact && !cornered ? (place ?? undefined) : undefined,
    toggle: onToggle,
  }
}
