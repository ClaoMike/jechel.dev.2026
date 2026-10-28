import { useId, useState } from 'react'
import { Modal } from '../../../components/Modal/Modal'
import { useAppDispatch } from '../../../store'
import { termsAccepted } from '../../../store/termsSlice'
import { ConsentList } from '../ConsentList/ConsentList'
import { useTerms } from '../useTerms'
import { strings } from '../../../strings'

/** What visitors confirm before they can use the site: everything else is in the terms themselves. */
const CONSENTS = [strings.termsGate.iHaveReadI] as const

/**
 * The welcome popup: visitors tick the box (they accept the terms), then continue. It can't be closed any other way
 * (no close button, Escape and clicks outside do nothing), but the terms can be opened above it.
 */
export function TermsGate() {
  const dispatch = useAppDispatch()
  const { version, openTerms } = useTerms()
  const [ticked, setTicked] = useState<boolean[]>(() => CONSENTS.map(() => false))
  const titleId = useId()
  const allTicked = ticked.every(Boolean)
  const consents = CONSENTS.map((text, i) => ({ text, ticked: ticked[i], setTicked: (on: boolean) => setTicked(ticked.map((value, k) => (k === i ? on : value))) }))

  return (
    <Modal labelledBy={titleId} onClose={() => {}} className="terms-gate">
      <h2 id={titleId}>{strings.termsGate.welcomeJechelDev}</h2>
      <p className="terms-gate-intro">
        {strings.termsGate.beforeContinuePleaseRead}{' '}
        <button type="button" className="link-button" onClick={openTerms}>
          {strings.common.termsConditions}
        </button>{' '}
        {strings.termsGate.confirmAcceptThem}
      </p>
      <ConsentList consents={consents} />
      <div className="terms-gate-actions">
        {!allTicked && <p className="terms-gate-hint">{strings.termsGate.tickBoxContinue}</p>}
        <button type="button" className="button" disabled={!allTicked} onClick={() => dispatch(termsAccepted(version))}>
          {strings.termsGate.continue}
        </button>
      </div>
    </Modal>
  )
}
