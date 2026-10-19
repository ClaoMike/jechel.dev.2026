import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Modal } from '../../../components/Modal/Modal'
import { TermsSkeleton } from '../TermsSkeleton/TermsSkeleton'
import { useTermsDialogViewModel } from './TermsDialog.viewModel'
import { TermsDocumentView } from '../TermsDocumentView/TermsDocumentView'

/** The terms in a popup. It sits above every other popup, the welcome one included. */
export function TermsDialog() {
  const { closeRef, ...vm } = useTermsDialogViewModel()

  return (
    <Modal labelledBy={vm.titleId} initialFocus={closeRef} onClose={vm.close} className="modal-wide terms-modal">
      <div className="modal-header">
        <h2 id={vm.titleId}>{vm.title}</h2>
        <button ref={closeRef} type="button" className="icon-button" onClick={vm.close} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {vm.state.status === 'loading' && <TermsSkeleton />}
      {vm.state.status === 'error' && <ErrorState message={vm.errorMessage} onRetry={vm.reload} />}
      {vm.state.status === 'loaded' && <TermsDocumentView terms={vm.state.data} hideTitle />}
      <div className="terms-modal-actions">
        <button type="button" className="button" onClick={vm.close}>
          Close
        </button>
      </div>
    </Modal>
  )
}
