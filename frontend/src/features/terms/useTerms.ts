import { useCallback } from 'react'
import { useLocation } from 'react-router'
import type { TermsDocument } from '../../services/api'
import { useAppDispatch, useAppSelector } from '../../store'
import { termsApi, useGetTermsQuery } from '../../store/api/termsApi'
import type { Loadable } from '../../store/loadable'
import { termsOpened } from '../../store/termsSlice'
import { termsVersion } from './acceptance'

export interface TermsValue {
  /** The terms, loaded once for the whole site. */
  state: Loadable<TermsDocument>
  /** The version a visitor accepts: the date they last changed. */
  version: string
  /** A visitor who hasn't accepted this version is asked before using the site (not the admin, not on /admin). */
  mustAccept: boolean
  /** This browser accepted the terms in force (or, while they can't be loaded, some version of them). Visits are only recorded then. */
  acceptedTerms: boolean
  /** True while the welcome popup is up, or may still come up (the terms or the session are loading). The footer hides meanwhile. */
  welcomeOpen: boolean
  /** Opens the terms in a popup, on top of anything else that's open. */
  openTerms: () => void
  /** Loads them again, e.g. after they couldn't be loaded. */
  reload: () => void
}

const selectTerms = termsApi.endpoints.getTerms.select()

/**
 * Loads the terms for the whole site: the one subscriber (TermsHost, always mounted). Everything else
 * reads them with useTerms, without subscribing: RTK Query asks again for a query that failed each
 * time something new subscribes, so the welcome popup coming up while they can't be loaded would ask
 * again, go while that's pending, come back when it fails, and so on, in a loop.
 */
export function useLoadTerms() {
  useGetTermsQuery()
}

/** The terms and conditions and what this visitor did with them, for view models: `const { openTerms } = useTerms()`. */
export function useTerms(): TermsValue {
  const dispatch = useAppDispatch()
  const result = useAppSelector(selectTerms)
  const state: Loadable<TermsDocument> = result.status === 'fulfilled' ? { status: 'loaded', data: result.data! } : result.status === 'rejected' ? { status: 'error' } : { status: 'loading' }
  const authStatus = useAppSelector((s) => s.auth.status)
  const accepted = useAppSelector((s) => s.terms.accepted)
  const version = termsVersion(state.status === 'loaded' ? state.data : null)
  // If the terms can't be loaded, only those who never accepted any version are asked.
  // Not on the admin's sign-in page (/admin): nothing there is for visitors.
  const onSignIn = useLocation().pathname.replace(/\/+$/, '') === '/admin'
  const mustAccept = !onSignIn && authStatus === 'anonymous' && (state.status === 'loaded' ? accepted !== version : state.status === 'error' && accepted === null)

  return {
    state,
    version,
    mustAccept,
    acceptedTerms: accepted !== null && (state.status === 'loaded' ? accepted === version : state.status === 'error'),
    welcomeOpen: mustAccept || authStatus === 'loading' || state.status === 'loading',
    openTerms: useCallback(() => dispatch(termsOpened()), [dispatch]),
    // Asks once more (not a subscription: see useLoadTerms).
    reload: useCallback(() => void dispatch(termsApi.endpoints.getTerms.initiate(undefined, { forceRefetch: true, subscribe: false })), [dispatch]),
  }
}
