import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth'
import { api, type TermsDocument } from '../../services/api'
import { acceptedVersion, rememberAcceptance, termsVersion } from './acceptance'
import { TermsContext, type TermsContextValue, type TermsState } from './termsContext'
import { TermsDialog } from './TermsDialog'
import { TermsGate } from './TermsGate'

/**
 * Loads the terms once for the whole site, shows them in a popup on request (useTerms().openTerms),
 * and asks visitors to accept them before using the site. The signed-in admin isn't asked.
 */
export function TermsProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth()
  const [state, setState] = useState<TermsState>({ status: 'loading' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [accepted, setAccepted] = useState(acceptedVersion)

  useEffect(() => {
    const controller = new AbortController()
    api.terms
      .get(controller.signal)
      .then((terms) => setState({ status: 'loaded', terms }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [])

  const openTerms = useCallback(() => setDialogOpen(true), [])
  const replaceTerms = useCallback((terms: TermsDocument) => setState({ status: 'loaded', terms }), [])
  const value = useMemo<TermsContextValue>(() => ({ state, openTerms, replaceTerms }), [state, openTerms, replaceTerms])

  const version = termsVersion(state.status === 'loaded' ? state.terms : null)
  // If the terms can't be loaded, only those who never accepted any version are asked.
  const mustAccept =
    authStatus === 'anonymous' && (state.status === 'loaded' ? accepted !== version : state.status === 'error' && accepted === null)

  function accept() {
    rememberAcceptance(version)
    setAccepted(version)
  }

  return (
    <TermsContext.Provider value={value}>
      {children}
      {mustAccept && <TermsGate onOpenTerms={openTerms} onAccept={accept} />}
      {dialogOpen && <TermsDialog state={state} onClose={() => setDialogOpen(false)} />}
    </TermsContext.Provider>
  )
}
