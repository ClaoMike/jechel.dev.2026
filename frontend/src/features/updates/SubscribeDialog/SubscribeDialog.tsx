import { Modal } from '../../../components/Modal/Modal'
import { SubscribeForm } from '../SubscribeForm/SubscribeForm'
import { SubscribeSent } from '../SubscribeSent/SubscribeSent'
import { useSubscribeDialogViewModel } from './SubscribeDialog.viewModel'

/** "Get updates": an email address, then a confirmation email (double opt-in). */
export function SubscribeDialog({ onClose }: { onClose: () => void }) {
  const { inputRef, ...vm } = useSubscribeDialogViewModel()

  return (
    <Modal labelledBy={vm.titleId} onClose={onClose} initialFocus={inputRef}>
      <div className="modal-header">
        <h2 id={vm.titleId}>Get updates</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {vm.sent ? <SubscribeSent {...vm.sent} onDone={onClose} /> : <SubscribeForm inputRef={inputRef} {...vm.form} />}
    </Modal>
  )
}
