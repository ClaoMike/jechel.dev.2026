/** Modal forms and their fields (git dialogs, file dialogs). */
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'
import { Icon } from './icons.tsx'

export interface DialogProps {
  title: string
  submitLabel: string
  danger?: boolean
  disabled?: boolean
  onSubmit(): void
  onClose(): void
  testId?: string
  children: ReactNode
}

/** A small modal form: Escape or a click outside cancels, Enter submits, the focus comes back afterwards. */
export function Dialog({ title, submitLabel, danger = false, disabled = false, onSubmit, onClose, testId = 'dialog', children }: DialogProps) {
  const form = useRef<HTMLFormElement>(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = form.current?.querySelector<HTMLElement>('input:not([type="checkbox"]):not([type="radio"]), textarea, [data-autofocus]') ?? form.current?.querySelector<HTMLElement>('button[type="submit"]')
    first?.focus()
    return () => previous?.focus?.()
  }, [])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!disabled) onSubmit()
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        ref={form}
        className="modal form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
        data-testid={testId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cancel">
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        <footer className="dialog-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`button primary${danger ? ' danger' : ''}`} disabled={disabled}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  )
}
