import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/shared/lib/store'
import { slowNoticeDismissed, themeChosen } from '../../model/themeSlice'
import type { Theme } from '@/shared/lib/theme'
import { strings } from '@/shared/i18n'

const NAMES: Record<Theme, string> = { dark: strings.slowSceneNotice.darkMode, light: strings.slowSceneNotice.lightMode, vice: strings.slowSceneNotice.vice }

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
          <p>
            {strings.slowSceneNotice.viceWasRunningSlowly}
            {NAMES[switchedTo]}.
          </p>
          <div className="slow-scene-actions">
            {/* Makes Vice their choice, so it isn't switched off again. */}
            <button type="button" className="button button-secondary button-small" onClick={() => dispatch(themeChosen('vice'))}>
              {strings.slowSceneNotice.useViceAnyway}
            </button>
            <button type="button" className="button button-small" onClick={() => dispatch(slowNoticeDismissed())}>
              {strings.slowSceneNotice.ok}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
