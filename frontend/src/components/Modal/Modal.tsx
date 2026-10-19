import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useModalViewModel } from './Modal.viewModel'

interface ModalProps {
  /** id of the element that names the dialog (usually its heading). */
  labelledBy: string
  /** Focused when it opens; by default the dialog itself. */
  initialFocus?: RefObject<HTMLElement | null>
  onClose: () => void
  /** Extra class on the dialog, e.g. "modal-wide". */
  className?: string
  children: ReactNode
}

/**
 * An accessible modal dialog: focus moves into it and stays there (Tab wraps), Escape or a click
 * on the backdrop closes it, and focus returns to whatever opened it.
 */
export function Modal({ labelledBy, initialFocus, onClose, className, children }: ModalProps) {
  const { dialogRef, ...vm } = useModalViewModel({ initialFocus, onClose })

  return createPortal(
    <div className="modal-backdrop" onKeyDown={vm.onKeyDown} onClick={vm.onClick} onMouseDown={vm.onMouseDown}>
      <div ref={dialogRef} className={className ? `modal ${className}` : 'modal'} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
