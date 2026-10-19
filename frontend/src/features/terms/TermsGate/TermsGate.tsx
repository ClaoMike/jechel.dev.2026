import { Modal } from '../../../components/Modal/Modal'
import { useTermsGateViewModel } from './TermsGate.viewModel'

/**
 * The welcome popup: visitors tick every box, then continue. It can't be closed any other way
 * (no close button, Escape and clicks outside do nothing), but the terms can be opened above it.
 */
export function TermsGate() {
  const vm = useTermsGateViewModel()

  return (
    <Modal labelledBy={vm.titleId} onClose={() => {}} className="terms-gate">
      <h2 id={vm.titleId}>Welcome to jechel.dev</h2>
      <p className="terms-gate-intro">
        Before you continue, please read the{' '}
        <button type="button" className="link-button" onClick={vm.openTerms}>
          Terms and Conditions
        </button>{' '}
        and confirm the following.
      </p>
      <fieldset className="terms-consents">
        <legend className="visually-hidden">Confirm each of these</legend>
        {vm.consents.map((consent, i) => (
          <label key={consent.text} className="terms-consent">
            <input type="checkbox" checked={consent.ticked} onChange={(event) => vm.setTicked(i, event.target.checked)} />
            <span>{consent.text}</span>
          </label>
        ))}
      </fieldset>
      <div className="terms-gate-actions">
        {!vm.allTicked && <p className="terms-gate-hint">Tick every box to continue.</p>}
        <button type="button" className="button" disabled={!vm.allTicked} onClick={vm.accept}>
          Continue
        </button>
      </div>
    </Modal>
  )
}
