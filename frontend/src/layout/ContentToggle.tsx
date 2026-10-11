import { useEffect, useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../components/icons'

/** How long without the pointer moving (or a key) before the button and the cursor fade away. */
export const IDLE_MS = 5000

const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * R* only: hides the page so just the Riviera scene shows. While it's hidden, the button (and the
 * cursor) fade out after a few seconds of stillness and come back on any movement; Escape brings
 * the page back too.
 */
export function ContentToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const [idle, setIdle] = useState(false)

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

  return (
    <button type="button" className={`button button-secondary content-toggle${idle ? ' content-toggle-idle' : ''}`} onClick={onToggle}>
      {hidden ? <EyeIcon /> : <EyeOffIcon />}
      {hidden ? 'Show page' : 'Hide page'}
    </button>
  )
}
