import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  /** id of the element that names the dialog (usually its heading). */
  labelledBy: string
  onClose: () => void
  children: ReactNode
}

/**
 * An accessible modal dialog: focus moves into it and stays there (Tab wraps), Escape or a click
 * on the backdrop closes it, and focus returns to whatever opened it.
 */
export function Modal({ labelledBy, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Latest onClose for the keydown listener, which is attached once.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current!
    dialog.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      // Move focus ourselves rather than only wrapping at the ends: Safari's own Tab skips buttons
      // and links, which would let focus escape the dialog.
      event.preventDefault()
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) return
      const index = focusable.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey
        ? focusable[index <= 0 ? focusable.length - 1 : index - 1]
        : focusable[index === -1 || index === focusable.length - 1 ? 0 : index + 1]
      next.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="modal-backdrop"
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
