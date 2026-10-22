import { Modal } from '../../../components/Modal/Modal'
import { ConsentList } from '../ConsentList/ConsentList'
import { useTermsGateViewModel } from './TermsGate.viewModel'

/**
 * The welcome popup: visitors tick the box (they accept the terms), then continue. It can't be closed any other way
 * (no close button, Escape and clicks outside do nothing), but the terms can be opened above it.
 */
export function TermsGate() {
  const vm = useTermsGateViewModel()

  return (
    <Modal labelledBy={vm.titleId} onClose={vm.stayOpen} className="terms-gate">
      <h2 id={vm.titleId}>Welcome to jechel.dev</h2>
      <p className="terms-gate-intro">
        Before you continue, please read the{' '}
        <button type="button" className="link-button" onClick={vm.openTerms}>
          Terms and Conditions
        </button>{' '}
        and confirm that you accept them.
      </p>
      <ConsentList consents={vm.consents} />
      <div className="terms-gate-actions">
        {!vm.allTicked && <p className="terms-gate-hint">Tick the box to continue.</p>}
        <button type="button" className="button" disabled={!vm.allTicked} onClick={vm.accept}>
          Continue
        </button>
      </div>
    </Modal>
  )
}
