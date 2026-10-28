import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'
import { TrashIcon } from '../icons/icons'

export interface DeleteButtonProps {
  /** What goes, for the question: "Delete {what}?", e.g. "the message from Ana". */
  what: string
  /** The verb, on the question and the confirm button. */
  action?: 'Delete' | 'Remove'
  /** Under the question. */
  detail?: ReactNode
  /** Runs once confirmed. May be async: the popup waits, and says so if it fails. */
  onDelete: () => void | Promise<void>
  /** The button's accessible name; by default "{action} {what}". */
  label?: string
  className?: string
  disabled?: boolean
  /** The button's content; by default a trash icon. */
  children?: ReactNode
}

/** A delete (or remove) button that asks for confirmation in a popup first. */
export function DeleteButton({
  what,
  action = 'Delete',
  detail = "This can't be undone.",
  onDelete,
  label,
  className = 'icon-button icon-button-danger',
  disabled,
  children,
}: DeleteButtonProps) {
  // Whether the confirmation popup is up.
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button type="button" className={className} aria-label={label ?? `${action} ${what}`} title={action} disabled={disabled} onClick={() => setAsking(true)}>
        {children ?? <TrashIcon />}
      </button>
      {asking && (
        <ConfirmDialog title={`${action} ${what}?`} confirmLabel={action} onConfirm={onDelete} onClose={() => setAsking(false)}>
          {detail && <p>{detail}</p>}
        </ConfirmDialog>
      )}
    </>
  )
}
