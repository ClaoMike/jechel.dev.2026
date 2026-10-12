import { useContext } from 'react'
import { TermsContext, type TermsContextValue } from './termsContext'

/** The terms and conditions, and a way to show them: `const { openTerms } = useTerms()`. */
export function useTerms(): TermsContextValue {
  const value = useContext(TermsContext)
  if (!value) throw new Error('useTerms must be used inside <TermsProvider>')
  return value
}
