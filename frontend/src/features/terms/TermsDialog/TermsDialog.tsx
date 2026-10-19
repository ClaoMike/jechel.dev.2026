import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Modal } from '../../../components/Modal/Modal'
import { Loading, SkeletonText } from '../../../components/Skeleton'
import { useTermsDialogViewModel } from './TermsDialog.viewModel'
import { TermsDocumentView } from '../TermsDocumentView'

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
      {vm.state.status === 'error' && <ErrorState message="The terms couldn't be loaded." onRetry={vm.reload} />}
      {vm.state.status === 'loaded' && <TermsDocumentView terms={vm.state.data} hideTitle />}
      <div className="terms-modal-actions">
        <button type="button" className="button" onClick={vm.close}>
          Close
        </button>
      </div>
    </Modal>
  )
}

/** The terms' shape while they load: an introduction, then numbered sections of paragraphs. */
export function TermsSkeleton() {
  return (
    <Loading label="Loading the terms…">
      <SkeletonText lines={2} />
      {[4, 3, 5].map((lines, i) => (
        <div key={i} className="skeleton-text">
          <SkeletonText lines={1} lineHeight={20} />
          <SkeletonText lines={lines} />
        </div>
      ))}
    </Loading>
  )
}
