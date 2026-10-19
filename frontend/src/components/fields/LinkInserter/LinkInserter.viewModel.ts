import { useId, useState, type KeyboardEvent, type RefObject } from 'react'
import { isSafeUrl } from '../../../features/about/format'
import { formatLink } from '../../../features/about/textLinks'
import type { FieldElement, Selection } from '../TextField/TextField.viewModel'

export interface LinkInserterProps {
  /** The field's label, to name the button and the group: "Add link to Title". */
  fieldLabel: string
  value: string
  onChange: (value: string) => void
  input: RefObject<FieldElement | null>
  /** The last cursor or selection in the field; null if it was never focused (the link goes at the end). */
  selection: RefObject<Selection | null>
}

/** The link being added: its text (the selected words, if any) and URL, then [text](url) in place of the selection, or at the cursor. */
export function useLinkInserterViewModel({ fieldLabel, value, onChange, input, selection }: LinkInserterProps) {
  const [draft, setDraft] = useState<{ start: number; end: number; label: string; url: string; error: string | null } | null>(null)
  const id = useId()

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
    labelId: `${id}-label`,
    urlId: `${id}-url`,
    errorId: `${id}-error`,
    groupLabel: `Add a link to ${fieldLabel}`,
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
    // Enter inserts the link instead of submitting the form around it; Escape closes it.
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        insert()
      } else if (event.key === 'Escape') {
        event.stopPropagation()
        setDraft(null)
      }
    },
  }
}
