import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { slowNoticeDismissed, themeChosen } from '../../store/themeSlice'
import type { Theme } from '../theme'

const NAMES: Record<Theme, string> = { dark: 'dark mode', light: 'light mode', vice: 'Vice' }

/** How long the notice stays before it goes by itself. */
const NOTICE_MS = 15000

/**
 * Says why the theme just changed when Vice was too slow for the device (themeSlice.reportSlowScene),
 * with a way to keep Vice anyway.
 */
export function SlowSceneNotice() {
  const dispatch = useAppDispatch()
  const switchedTo = useAppSelector((state) => state.theme.slowSwitchedTo)

  useEffect(() => {
    if (!switchedTo) return
    const timer = setTimeout(() => dispatch(slowNoticeDismissed()), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [switchedTo, dispatch])

  return (
    <div className="slow-scene-notice" role="status" hidden={!switchedTo}>
      {switchedTo && (
        <>
          <p>Vice was running slowly on this device, so the site switched to {NAMES[switchedTo]}.</p>
          <div className="slow-scene-actions">
            {/* Makes Vice their choice, so it isn't switched off again. */}
            <button type="button" className="button button-secondary button-small" onClick={() => dispatch(themeChosen('vice'))}>
              Use Vice anyway
            </button>
            <button type="button" className="button button-small" onClick={() => dispatch(slowNoticeDismissed())}>
              OK
            </button>
          </div>
        </>
      )}
    </div>
  )
}
