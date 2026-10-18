import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth'
import { api, type TermsDocument } from '../../services/api'
import { trackEvent } from '../analytics'
import { usePreviewMode } from '../preview/preview'
import { acceptedVersion, rememberAcceptance, termsVersion } from './acceptance'
import { TermsContext, type TermsContextValue, type TermsState } from './termsContext'
import { TermsDialog } from './TermsDialog'
import { TermsGate } from './TermsGate'

const LOADING: TermsState = { status: 'loading' }

/**
 * Loads the terms once for the whole site, shows them in a popup on request (useTerms().openTerms),
 * and asks visitors to accept them before using the site. The signed-in admin isn't asked.
 */
export function TermsProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth()
  // The last answer, and which load it answers: while it's for an earlier one, the terms are loading.
  const [result, setResult] = useState<{ key: string; state: TermsState } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [accepted, setAccepted] = useState(acceptedVersion)
  const [attempt, setAttempt] = useState(0)
  // The admin's preview switch: the terms load again like everything else (AppLayout applies it to requests first).
  const previewMode = usePreviewMode()
  const preview = authStatus === 'authenticated' ? previewMode : 'normal'
  const key = `${attempt}|${preview}`
  const state: TermsState = result?.key === key ? result.state : LOADING

  useEffect(() => {
    const controller = new AbortController()
    api.terms
      .get(controller.signal)
      .then((terms) => setResult({ key, state: { status: 'loaded', terms } }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'error' } })
      })
    return () => controller.abort()
  }, [key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const openTerms = useCallback(() => setDialogOpen(true), [])
  const replaceTerms = useCallback((terms: TermsDocument) => setResult({ key, state: { status: 'loaded', terms } }), [key])
  const version = termsVersion(state.status === 'loaded' ? state.terms : null)
  // If the terms can't be loaded, only those who never accepted any version are asked.
  const mustAccept =
    authStatus === 'anonymous' && (state.status === 'loaded' ? accepted !== version : state.status === 'error' && accepted === null)

  const welcomeOpen = mustAccept || authStatus === 'loading' || state.status === 'loading'

  const value = useMemo<TermsContextValue>(() => ({ state, welcomeOpen, openTerms, replaceTerms, reload }), [state, welcomeOpen, openTerms, replaceTerms, reload])

  function accept() {
    rememberAcceptance(version)
    setAccepted(version)
    trackEvent('Terms accepted')
  }

  return (
    <TermsContext.Provider value={value}>
      {children}
      {mustAccept && <TermsGate onOpenTerms={openTerms} onAccept={accept} />}
      {dialogOpen && <TermsDialog state={state} onRetry={reload} onClose={() => setDialogOpen(false)} />}
    </TermsContext.Provider>
  )
}
