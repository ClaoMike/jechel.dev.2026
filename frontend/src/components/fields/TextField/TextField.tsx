import { useId, useRef, type SyntheticEvent } from 'react'
import { LinkInserter } from '../LinkInserter/LinkInserter'

export type FieldElement = HTMLInputElement & HTMLTextAreaElement
export type Selection = { start: number; end: number }

export interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  multiline?: boolean
  type?: 'text' | 'url' | 'number' | 'tel' | 'email'
  required?: boolean
  placeholder?: string
  min?: number
  max?: number
  /** Show an "Add link" button that inserts [text](url) at the cursor. */
  allowLinks?: boolean
  /** Offered while typing; anything else can still be typed. */
  suggestions?: string[]
  /** For the label, e.g. "label-admin" (coloured as only the admin sees it). */
  labelClassName?: string
}

/** A labelled text box (or text area), with an optional hint, error, suggestions and "Add link". */
export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  multiline = false,
  type = 'text',
  required,
  placeholder,
  min,
  max,
  allowLinks = false,
  suggestions,
  labelClassName,
}: TextFieldProps) {
  const id = useId()
  const inputRef = useRef<FieldElement>(null)
  // Where the cursor last was: for "Add link", as the field has lost focus by the time it's clicked.
  const selection = useRef<Selection | null>(null)
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const suggestionsId = suggestions ? `${id}-suggestions` : undefined

  const common = {
    id,
    value,
    required,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
    onSelect: (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      selection.current = { start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 }
    },
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }

  return (
    <div className="field">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {multiline ? <textarea ref={inputRef} {...common} rows={3} /> : <input ref={inputRef} {...common} type={type} min={min} max={max} list={suggestionsId} />}
      {suggestions && (
        <datalist id={suggestionsId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
      {allowLinks && <LinkInserter fieldLabel={label} value={value} onChange={onChange} input={inputRef} selection={selection} />}
    </div>
  )
}
