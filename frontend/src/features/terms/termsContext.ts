import { createContext } from 'react'
import type { TermsDocument } from '../../services/api'

export type TermsState = { status: 'loading' } | { status: 'loaded'; terms: TermsDocument } | { status: 'error' }

export interface TermsContextValue {
  /** The terms, loaded once for the whole site. */
  state: TermsState
  /** True while the welcome popup is up, or may still come up (the terms or the session are loading). The footer hides meanwhile. */
  welcomeOpen: boolean
  /** Opens the terms in a popup, on top of anything else that's open. */
  openTerms: () => void
  /** After the admin saves: everyone on this page sees the new terms. */
  replaceTerms: (terms: TermsDocument) => void
}

export const TermsContext = createContext<TermsContextValue | null>(null)
