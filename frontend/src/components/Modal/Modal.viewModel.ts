import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus moves into the dialog and stays there (Tab wraps); Escape or the backdrop closes it, unless it isn't
 * `dismissible`; focus returns to its opener.
 */
export function useModalViewModel({ initialFocus, onClose, dismissible = true }: { initialFocus?: RefObject<HTMLElement | null>; onClose: () => void; dismissible?: boolean }) {
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
      if (dismissible) onClose()
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

  return {
    dialogRef,
    onKeyDown,
    // Clicks inside stay inside, e.g. a dialog opened from a table row doesn't also click the row.
    onClick: (event: MouseEvent) => event.stopPropagation(),
    onMouseDown: (event: MouseEvent) => {
      if (dismissible && event.target === event.currentTarget) onClose()
    },
  }
}
