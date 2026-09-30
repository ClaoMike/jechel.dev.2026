import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A dropdown sheet under the top bar (phones): a small non-modal dialog of grouped controls. Closes
 * on Escape or a tap outside it (the button that opens it, labelled "View options", toggles it).
 */
export function MenuSheet({ label, onClose, children, testId }: { label: string; onClose: () => void; children: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!ref.current?.contains(target) && !target.closest('[aria-label="View options"]')) onClose()
    }
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', key)
    }
  })
  return (
    <div ref={ref} className="view-menu" role="dialog" aria-label={label} data-testid={testId}>
      {children}
    </div>
  )
}

export function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <circle cx="4.5" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="15.5" cy="10" r="1.6" />
    </svg>
  )
}
