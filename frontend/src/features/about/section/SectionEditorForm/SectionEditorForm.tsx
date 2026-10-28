import type { FormEvent, ReactNode } from 'react'
import { strings } from '../../../../strings'

export interface SectionEditorFormProps {
  /** Names the form: "Edit Skills". */
  label: string
  saving: boolean
  /** Why the last save failed, if it did. */
  message: string | null
  submit: (event: FormEvent<HTMLFormElement>) => void
  cancel: () => void
  /** The section's editor. */
  children: ReactNode
}

/** A section in edit mode: its editor, then why saving failed (if it did), Save and Cancel. */
export function SectionEditorForm({ label, saving, message, submit, cancel, children }: SectionEditorFormProps) {
  return (
    <form className="about-editor" noValidate onSubmit={submit} aria-label={label}>
      {children}
      {message && (
        <p role="alert" className="form-error">
          {message}
        </p>
      )}
      <div className="about-editor-actions">
        <button type="submit" className="button" disabled={saving}>
          {saving ? strings.common.saving : strings.common.save}
        </button>
        <button type="button" className="button button-secondary" disabled={saving} onClick={cancel}>
          {strings.common.cancel}
        </button>
      </div>
    </form>
  )
}
