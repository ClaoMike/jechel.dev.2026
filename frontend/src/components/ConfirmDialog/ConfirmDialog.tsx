import type { ReactNode } from 'react'
import { useConfirmDialogViewModel } from './ConfirmDialog.viewModel'
import { Modal } from '../Modal/Modal'

export interface ConfirmDialogProps {
  /** The question, e.g. "Delete the message from Ana?" */
  title: string
  /** Under the question, e.g. "This can't be undone." */
  children?: ReactNode
  /** The confirm button's text, e.g. "Delete". */
  confirmLabel: string
  /** The other button's text: "Cancel" by default ("Keep it" when the action is itself a cancelling). */
  cancelLabel?: string
  /** Danger styling for the confirm button (default). */
  danger?: boolean
  /** What to say when `onConfirm` fails, instead of "That didn't work. Please try again." */
  failure?: string
  /** May be async: the dialog waits, and shows an error if it fails. It closes itself on success. */
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

/** Asks before doing something. Cancel has the focus, so Enter by mistake does nothing. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', failure, danger = true, onConfirm, onClose }: ConfirmDialogProps) {
  const { cancelRef, ...vm } = useConfirmDialogViewModel({ onConfirm, onClose })

  return (
    <Modal labelledBy={vm.titleId} initialFocus={cancelRef} onClose={vm.close}>
      <div className="confirm-dialog">
        <h2 id={vm.titleId}>{title}</h2>
        {children && <div className="confirm-dialog-body">{children}</div>}
        {vm.failed && (
          <p role="alert" className="field-error">
            {failure || "That didn't work. Please try again."}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" className="button button-secondary" disabled={vm.busy} onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? 'button button-danger' : 'button'} disabled={vm.busy} onClick={vm.confirm}>
            {vm.busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
