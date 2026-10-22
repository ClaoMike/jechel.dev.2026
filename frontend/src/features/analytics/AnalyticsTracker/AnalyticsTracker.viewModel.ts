import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useAppSelector } from '../../../store'
import { useTerms } from '../../terms'
import { TERMS_ACCEPTED, THEME_CHANGED, tracker, type Tracker } from '../tracker'

/**
 * Feeds the tracker the pages opened, theme switches and who's browsing. A visit is only recorded once
 * the visitor has accepted the terms (which say what's recorded): until then nothing is recorded or
 * kept, and the visit starts with the page on show and "Terms accepted". The admin isn't recorded.
 */
export function useAnalyticsTrackerViewModel(instance: Tracker = tracker) {
  const { pathname, search } = useLocation()
  const status = useAppSelector((state) => state.auth.status)
  const { acceptedTerms, state: terms } = useTerms()
  // The version this browser accepted: it changes when the visitor accepts during this visit.
  const acceptedVersion = useAppSelector((state) => state.terms.accepted)
  const theme = useAppSelector((state) => state.theme.theme)
  const shownTheme = useRef(theme)
  const acceptedBefore = useRef(acceptedVersion)

  useEffect(() => instance.install(), [instance])

  useEffect(() => {
    const checking = status === 'loading' || terms.status === 'loading'
    // While it's being checked, a visitor who accepted some version before is kept for; one who never did isn't.
    instance.setMode(status === 'authenticated' ? 'off' : checking ? (acceptedVersion !== null ? 'waiting' : 'off') : acceptedTerms ? 'on' : 'off')
  }, [instance, status, terms.status, acceptedTerms, acceptedVersion])

  // Accepted during this visit: recorded right after the page it was accepted on.
  useEffect(() => {
    if (acceptedVersion === acceptedBefore.current) return
    acceptedBefore.current = acceptedVersion
    if (acceptedVersion !== null && status !== 'authenticated') instance.event(TERMS_ACCEPTED)
  }, [instance, acceptedVersion, status])

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
