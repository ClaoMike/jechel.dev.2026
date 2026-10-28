import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EyeIcon, EyeOffIcon } from '../../components/icons/icons'
import { NARROW, useMediaQuery } from '../useMediaQuery'

/** How long without the pointer moving (or a key) before the button and the cursor fade away. */
const IDLE_MS = 5000

const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const

export interface ContentToggleProps {
  hidden: boolean
  onToggle: () => void
  /** On phones, where the button sits in the header while the page shows. */
  slot?: HTMLElement | null
}

/**
 * Vice only: hides the page so just the Riviera scene shows. While it's hidden, the button (and the
 * cursor) fade out after a few seconds of stillness and come back on any movement; Escape brings
 * the page back too.
 *
 * On wide screens it floats at the bottom right, with its words. On phones it's an icon in the header,
 * left of "Buy me a coffee": while the page shows it's rendered inside `slot` there, so it scrolls,
 * bounces and slides exactly as the header does. While the page is hidden the header is away, so it
 * waits in the bottom-right corner instead.
 */
export function ContentToggle({ hidden, onToggle, slot }: ContentToggleProps) {
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
  const label = hidden ? 'Show page' : 'Hide page'
  const className = `button button-secondary content-toggle${compact ? ' content-toggle-compact' : ''}${cornered ? ' content-toggle-cornered' : ''}${idle ? ' content-toggle-idle' : ''}`
  const toggle = () => {
    refocus.current = document.activeElement === buttonRef.current
    onToggle()
  }

  const button = (
    <button ref={buttonRef} type="button" className={className} title={compact ? label : undefined} onClick={toggle}>
      {hidden ? <EyeIcon /> : <EyeOffIcon />}
      <span className={compact ? 'visually-hidden' : undefined}>{label}</span>
    </button>
  )
  return compact && !cornered ? createPortal(button, slot) : button
}
