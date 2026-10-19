import { useCallback } from 'react'
import { useLocation } from 'react-router'
import type { TermsDocument } from '../../services/api'
import { useAppDispatch, useAppSelector } from '../../store'
import { useGetTermsQuery } from '../../store/api/termsApi'
import { toLoadable, type Loadable } from '../../store/loadable'
import { termsOpened } from '../../store/termsSlice'
import { termsVersion } from './acceptance'

export interface TermsValue {
  /** The terms, loaded once for the whole site. */
  state: Loadable<TermsDocument>
  /** The version a visitor accepts: the date they last changed. */
  version: string
  /** A visitor who hasn't accepted this version is asked before using the site (not the admin, not on /admin). */
  mustAccept: boolean
  /** True while the welcome popup is up, or may still come up (the terms or the session are loading). The footer hides meanwhile. */
  welcomeOpen: boolean
  /** Opens the terms in a popup, on top of anything else that's open. */
  openTerms: () => void
  /** Loads them again, e.g. after they couldn't be loaded. */
  reload: () => void
}

/** The terms and conditions and what this visitor did with them, for view models: `const { openTerms } = useTerms()`. */
export function useTerms(): TermsValue {
  const dispatch = useAppDispatch()
  const query = useGetTermsQuery()
  const state = toLoadable(query)
  const authStatus = useAppSelector((s) => s.auth.status)
  const accepted = useAppSelector((s) => s.terms.accepted)
  const version = termsVersion(state.status === 'loaded' ? state.data : null)
  // If the terms can't be loaded, only those who never accepted any version are asked.
  // Not on the admin's sign-in page (/admin): nothing there is for visitors.
  const onSignIn = useLocation().pathname.replace(/\/+$/, '') === '/admin'
  const mustAccept = !onSignIn && authStatus === 'anonymous' && (state.status === 'loaded' ? accepted !== version : state.status === 'error' && accepted === null)
  const { refetch } = query

  return {
    state,
    version,
    mustAccept,
    welcomeOpen: mustAccept || authStatus === 'loading' || state.status === 'loading',
    openTerms: useCallback(() => dispatch(termsOpened()), [dispatch]),
    reload: useCallback(() => void refetch(), [refetch]),
  }
}
