import { useId, useState } from 'react'
import { useAppDispatch } from '../../../store'
import { termsAccepted } from '../../../store/termsSlice'
import { useTerms } from '../useTerms'

/** What visitors confirm before they can use the site: everything else is in the terms themselves. */
export const CONSENTS = ['I have read and I accept the Terms and Conditions of this website.'] as const

export function useTermsGateViewModel() {
  const dispatch = useAppDispatch()
  const { version, openTerms } = useTerms()
  const [ticked, setTicked] = useState<boolean[]>(() => CONSENTS.map(() => false))

  return {
    titleId: useId(),
    consents: CONSENTS.map((text, i) => ({ text, ticked: ticked[i], setTicked: (on: boolean) => setTicked(ticked.map((value, k) => (k === i ? on : value))) })),
    allTicked: ticked.every(Boolean),
    // It can't be closed: Escape and clicks outside do nothing.
    stayOpen: () => {},
    openTerms,
    accept: () => dispatch(termsAccepted(version)),
  }
}
