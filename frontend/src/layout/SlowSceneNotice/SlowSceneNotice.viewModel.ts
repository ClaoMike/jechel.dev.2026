import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { slowNoticeDismissed, themeChosen } from '../../store/themeSlice'
import type { Theme } from '../theme'

const NAMES: Record<Theme, string> = { dark: 'dark mode', light: 'light mode', vice: 'Vice' }

/** How long the notice stays before it goes by itself. */
export const NOTICE_MS = 15000

export function useSlowSceneNoticeViewModel() {
  const dispatch = useAppDispatch()
  const switchedTo = useAppSelector((state) => state.theme.slowSwitchedTo)

  useEffect(() => {
    if (!switchedTo) return
    const timer = setTimeout(() => dispatch(slowNoticeDismissed()), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [switchedTo, dispatch])

  return {
    shown: switchedTo !== null,
    message: switchedTo ? `Vice was running slowly on this device, so the site switched to ${NAMES[switchedTo]}.` : '',
    // Makes Vice their choice, so it isn't switched off again.
    keepVice: () => dispatch(themeChosen('vice')),
    dismiss: () => dispatch(slowNoticeDismissed()),
  }
}
