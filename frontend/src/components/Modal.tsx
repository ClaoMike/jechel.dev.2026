import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  /** id of the element that names the dialog (usually its heading). */
  labelledBy: string
  /** Focused when it opens; by default the dialog itself. */
  initialFocus?: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
}

/**
 * An accessible modal dialog: focus moves into it and stays there (Tab wraps), Escape or a click
 * on the backdrop closes it, and focus returns to whatever opened it.
 */
export function Modal({ labelledBy, initialFocus, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef(initialFocus)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(initialFocusRef.current?.current ?? dialogRef.current!).focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [])

  // Focus stays inside the dialog, so its keys arrive here. They stop here too: React passes a
  // portal's events to its parents, and a popup or dialog this one opened from mustn't see them
  // (Escape closes only the top dialog).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    // Move focus ourselves rather than only wrapping at the ends: Safari's own Tab skips buttons
    // and links, which would let focus escape the dialog.
    event.preventDefault()
    const dialog = dialogRef.current!
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) return
    const index = focusable.indexOf(document.activeElement as HTMLElement)
    const next = event.shiftKey
      ? focusable[index <= 0 ? focusable.length - 1 : index - 1]
      : focusable[index === -1 || index === focusable.length - 1 ? 0 : index + 1]
    next.focus()
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onKeyDown={onKeyDown}
      // Clicks inside stay inside, e.g. a dialog opened from a table row doesn't also click the row.
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
