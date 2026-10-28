import { useId, useRef, useState, type ReactNode } from 'react'
import { Modal } from '../Modal/Modal'
import { strings } from '../../strings'

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
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = strings.common.cancel, failure, danger = true, onConfirm, onClose }: ConfirmDialogProps) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const busy = state === 'busy'

  // Waits for `onConfirm` (it may be async), says so if it fails, and closes on success.
  async function confirm() {
    setState('busy')
    try {
      await onConfirm()
    } catch {
      setState('failed')
      return
    }
    onClose()
  }

  return (
    <Modal labelledBy={titleId} initialFocus={cancelRef} onClose={() => !busy && onClose()}>
      <div className="confirm-dialog">
        <h2 id={titleId}>{title}</h2>
        {children && <div className="confirm-dialog-body">{children}</div>}
        {state === 'failed' && (
          <p role="alert" className="field-error">
            {failure || strings.common.didntWorkPleaseTry}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" className="button button-secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? 'button button-danger' : 'button'} disabled={busy} onClick={() => void confirm()}>
            {busy ? strings.confirmDialog.working : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
