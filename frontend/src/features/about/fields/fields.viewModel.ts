import { useId, useRef, useState, type KeyboardEvent, type RefObject, type SyntheticEvent } from 'react'
import { isSafeUrl } from '../format'
import { formatLink } from '../textLinks'

type FieldElement = HTMLInputElement & HTMLTextAreaElement
type Selection = { start: number; end: number }

/** A field's ids and ARIA wiring, and where its cursor last was (for "Add link": the field has lost focus by the time it's clicked). */
export function useTextFieldViewModel({ hint, error, value, required, placeholder }: { hint?: string; error?: string; value: string; required?: boolean; placeholder?: string }) {
  const id = useId()
  const inputRef = useRef<FieldElement>(null)
  const selection = useRef<Selection | null>(null)
  return {
    id,
    inputRef,
    selection,
    common: {
      id,
      value,
      required,
      placeholder,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
      ref: inputRef,
      onSelect: (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        selection.current = { start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 }
      },
    },
  }
}

export interface LinkInserterOptions {
  value: string
  onChange: (value: string) => void
  input: RefObject<FieldElement | null>
  /** The last cursor or selection in the field; null if it was never focused (the link goes at the end). */
  selection: RefObject<Selection | null>
}

/** The link being added: its text (the selected words, if any) and URL, then [text](url) in place of the selection, or at the cursor. */
export function useLinkInserterViewModel({ value, onChange, input, selection }: LinkInserterOptions) {
  const [draft, setDraft] = useState<{ start: number; end: number; label: string; url: string; error: string | null } | null>(null)

  function insert() {
    if (!draft) return
    if (!isSafeUrl(draft.url) || draft.url.trim() === 'https://') {
      setDraft({ ...draft, error: 'Enter a full link (https://…) or a path on this site (/…).' })
      return
    }
    const link = formatLink(draft.label, draft.url)
    onChange(value.slice(0, draft.start) + link + value.slice(draft.end))
    setDraft(null)
    const cursor = draft.start + link.length
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(cursor, cursor)
    })
  }

  return {
    id: useId(),
    draft,
    open: () => {
      const end = Math.min(selection.current?.end ?? value.length, value.length)
      const start = Math.min(selection.current?.start ?? value.length, end)
      setDraft({ start, end, label: value.slice(start, end), url: 'https://', error: null })
    },
    setLabel: (label: string) => setDraft((current) => current && { ...current, label }),
    setUrl: (url: string) => setDraft((current) => current && { ...current, url, error: null }),
    insert,
    cancel: () => setDraft(null),
    // Enter inserts the link instead of submitting the section's form.
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        insert()
      } else if (event.key === 'Escape') {
        setDraft(null)
      }
    },
  }
}

/** Just the ids a field's label and error hang off. */
export function useFieldIdViewModel() {
  return { id: useId() }
}

const YEAR = /^\d{4}$/

/** A month and a year typed separately; the value is the first of the month, "YYYY-MM-01". */
export function useMonthFieldViewModel(value: string, onChange: (value: string) => void) {
  // The year box keeps what's typed (e.g. "20" on the way to "2024"), and resyncs when the value
  // changes from outside, e.g. when an item above is removed and this field shows another item.
  const [year, setYear] = useState(value.slice(0, 4))
  const [shownValue, setShownValue] = useState(value)
  if (value !== shownValue) {
    setShownValue(value)
    setYear(value.slice(0, 4))
  }
  const month = Number(value.slice(5, 7)) || 1

  const emit = (nextYear: string, nextMonth: number) => {
    if (YEAR.test(nextYear)) onChange(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`)
  }

  return {
    id: useId(),
    year,
    month,
    yearValid: YEAR.test(year),
    setMonth: (next: number) => emit(year, next),
    setYear: (next: string) => {
      setYear(next)
      emit(next, month)
    },
  }
}
