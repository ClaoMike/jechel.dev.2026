import { useId, useState } from 'react'
import { useAppDispatch } from '../../../store'
import { termsAccepted } from '../../../store/termsSlice'
import { useTerms } from '../useTerms'

/** What visitors confirm before they can use the site. Placeholders for now. */
export const CONSENTS = [
  'I have read and I accept the Terms and Conditions of this website.',
  'I understand that this website is a personal portfolio, provided as it is.',
  'I agree that messages I send through the contact form are stored so that they can be answered.',
] as const

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
