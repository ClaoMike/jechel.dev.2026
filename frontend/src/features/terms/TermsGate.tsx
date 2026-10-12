import { useId, useState } from 'react'
import { Modal } from '../../components/Modal'

/** What visitors confirm before they can use the site. Placeholders for now. */
const CONSENTS = [
  'I have read and I accept the Terms and Conditions of this website.',
  'I understand that this website is a personal portfolio, provided as it is.',
  'I agree that messages I send through the contact form are stored so that they can be answered.',
] as const

/**
 * The welcome popup: visitors tick every box, then continue. It can't be closed any other way
 * (no close button, Escape and clicks outside do nothing), but the terms can be opened above it.
 */
export function TermsGate({ onOpenTerms, onAccept }: { onOpenTerms: () => void; onAccept: () => void }) {
  const titleId = useId()
  const [ticked, setTicked] = useState<boolean[]>(() => CONSENTS.map(() => false))
  const allTicked = ticked.every(Boolean)

  return (
    <Modal labelledBy={titleId} onClose={() => {}} className="terms-gate">
      <h2 id={titleId}>Welcome to jechel.dev</h2>
      <p className="terms-gate-intro">
        Before you continue, please read the{' '}
        <button type="button" className="link-button" onClick={onOpenTerms}>
          Terms and Conditions
        </button>{' '}
        and confirm the following.
      </p>
      <fieldset className="terms-consents">
        <legend className="visually-hidden">Confirm each of these</legend>
        {CONSENTS.map((consent, i) => (
          <label key={consent} className="terms-consent">
            <input type="checkbox" checked={ticked[i]} onChange={(event) => setTicked(ticked.map((value, k) => (k === i ? event.target.checked : value)))} />
            <span>{consent}</span>
          </label>
        ))}
      </fieldset>
      <div className="terms-gate-actions">
        {!allTicked && <p className="terms-gate-hint">Tick every box to continue.</p>}
        <button type="button" className="button" disabled={!allTicked} onClick={onAccept}>
          Continue
        </button>
      </div>
    </Modal>
  )
}
