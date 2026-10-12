import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from '../../auth'
import { useTheme } from '../../layout/theme'
import { THEME_CHANGED, tracker, type Tracker } from './tracker'

/** Feeds the tracker the pages opened, theme switches and who's browsing (the admin isn't recorded). Renders nothing. */
export function AnalyticsTracker({ instance = tracker }: { instance?: Tracker }) {
  const { pathname, search } = useLocation()
  const { status } = useAuth()
  const theme = useTheme()
  const shownTheme = useRef(theme)

  useEffect(() => instance.install(), [instance])

  useEffect(() => {
    instance.setMode(status === 'loading' ? 'waiting' : status === 'authenticated' ? 'off' : 'on')
  }, [instance, status])

  useEffect(() => {
    instance.pageview(pathname + search)
  }, [instance, pathname, search])

  // The theme a visit starts and ends in goes with every batch; this records each switch on the way.
  useEffect(() => {
    if (theme === shownTheme.current) return
    instance.event(THEME_CHANGED, { from: shownTheme.current, to: theme })
    shownTheme.current = theme
  }, [instance, theme])

  return null
}
