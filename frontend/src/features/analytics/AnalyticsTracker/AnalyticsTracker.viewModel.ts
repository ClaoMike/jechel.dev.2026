import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useAppSelector } from '../../../store'
import { useTerms } from '../../terms'
import { THEME_CHANGED, tracker, type Tracker } from '../tracker'

/**
 * Feeds the tracker the pages opened, theme switches and who's browsing. A visit is only recorded once
 * the visitor has accepted the terms (which say what's recorded): until then it waits, and a visitor
 * who never accepts is never sent. The admin isn't recorded.
 */
export function useAnalyticsTrackerViewModel(instance: Tracker = tracker) {
  const { pathname, search } = useLocation()
  const status = useAppSelector((state) => state.auth.status)
  const { acceptedTerms } = useTerms()
  const theme = useAppSelector((state) => state.theme.theme)
  const shownTheme = useRef(theme)

  useEffect(() => instance.install(), [instance])

  useEffect(() => {
    instance.setMode(status === 'authenticated' ? 'off' : status === 'anonymous' && acceptedTerms ? 'on' : 'waiting')
  }, [instance, status, acceptedTerms])

  useEffect(() => {
    instance.pageview(pathname + search)
  }, [instance, pathname, search])

  // The theme a visit starts and ends in goes with every batch; this records each switch on the way.
  useEffect(() => {
    if (theme === shownTheme.current) return
    instance.event(THEME_CHANGED, { from: shownTheme.current, to: theme })
    shownTheme.current = theme
  }, [instance, theme])
}
