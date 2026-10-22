import { useId, useRef, type SyntheticEvent } from 'react'

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

/** A field's ids and ARIA wiring, and where its cursor last was (for "Add link": the field has lost focus by the time it's clicked). */
export function useTextFieldViewModel({ hint, error, value, required, placeholder, suggestions, onChange }: TextFieldProps) {
  const id = useId()
  const inputRef = useRef<FieldElement>(null)
  const selection = useRef<Selection | null>(null)
  return {
    id,
    inputRef,
    selection,
    hintId: hint ? `${id}-hint` : undefined,
    errorId: error ? `${id}-error` : undefined,
    suggestionsId: suggestions ? `${id}-suggestions` : undefined,
    common: {
      id,
      value,
      required,
      placeholder,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
      onSelect: (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        selection.current = { start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 }
      },
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    },
  }
}
