import { useEffect, useState } from 'react'
import { onSlowSceneSwitch, setTheme, type Theme } from './theme'

const NAMES: Record<Theme, string> = { dark: 'dark mode', light: 'light mode', vice: 'Vice' }

/** How long the notice stays before it goes by itself. */
export const NOTICE_MS = 15000

/**
 * Says why the theme just changed when Vice was too slow for the device (theme.reportSlowScene),
 * with a way to keep Vice anyway (which makes it their choice, so it isn't switched off again).
 */
export function SlowSceneNotice() {
  const [switchedTo, setSwitchedTo] = useState<Theme | null>(null)

  useEffect(() => onSlowSceneSwitch(setSwitchedTo), [])

  useEffect(() => {
    if (!switchedTo) return
    const timer = setTimeout(() => setSwitchedTo(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [switchedTo])

  return (
    <div className="slow-scene-notice" role="status" hidden={!switchedTo}>
      {switchedTo && (
        <>
          <p>Vice was running slowly on this device, so the site switched to {NAMES[switchedTo]}.</p>
          <div className="slow-scene-actions">
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => {
                setTheme('vice')
                setSwitchedTo(null)
              }}
            >
              Use Vice anyway
            </button>
            <button type="button" className="button button-small" onClick={() => setSwitchedTo(null)}>
              OK
            </button>
          </div>
        </>
      )}
    </div>
  )
}
