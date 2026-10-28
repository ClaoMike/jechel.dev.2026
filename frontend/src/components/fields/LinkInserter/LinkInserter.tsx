import { useId, useState, type KeyboardEvent, type RefObject } from 'react'
import { isSafeUrl } from '../../../features/about/format'
import { formatLink } from '../../../features/about/textLinks'
import { LinkIcon } from '../../icons/icons'
import type { FieldElement, Selection } from '../TextField/TextField'

export interface LinkInserterProps {
  /** The field's label, to name the button and the group: "Add link to Title". */
  fieldLabel: string
  value: string
  onChange: (value: string) => void
  input: RefObject<FieldElement | null>
  /** The last cursor or selection in the field; null if it was never focused (the link goes at the end). */
  selection: RefObject<Selection | null>
}

/**
 * "Add link": asks for the link's text (the selected words, if any) and URL, then puts
 * [text](url) in place of the selection, or at the cursor.
 */
export function LinkInserter({ fieldLabel, value, onChange, input, selection }: LinkInserterProps) {
  const [draft, setDraft] = useState<{ start: number; end: number; label: string; url: string; error: string | null } | null>(null)
  const id = useId()
  const labelId = `${id}-label`
  const urlId = `${id}-url`
  const errorId = `${id}-error`

  function open() {
    const end = Math.min(selection.current?.end ?? value.length, value.length)
    const start = Math.min(selection.current?.start ?? value.length, end)
    setDraft({ start, end, label: value.slice(start, end), url: 'https://', error: null })
  }

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

  // Enter inserts the link instead of submitting the form around it; Escape closes it.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      insert()
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      setDraft(null)
    }
  }

  if (!draft) {
    return (
      <button type="button" className="text-button" onClick={open}>
        <LinkIcon size={14} />
        Add link <span className="visually-hidden">to {fieldLabel}</span>
      </button>
    )
  }

  return (
    <div className="link-inserter" role="group" aria-label={`Add a link to ${fieldLabel}`}>
      <div className="field">
        <label htmlFor={labelId}>Link text</label>
        <input
          id={labelId}
          value={draft.label}
          onChange={(e) => {
            const label = e.target.value
            setDraft((current) => current && { ...current, label })
          }}
          onKeyDown={onKeyDown}
          placeholder="The University of Manchester"
        />
      </div>
      <div className="field">
        <label htmlFor={urlId}>Link URL</label>
        <input
          id={urlId}
          type="url"
          value={draft.url}
          autoFocus
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? errorId : undefined}
          onChange={(e) => {
            const url = e.target.value
            setDraft((current) => current && { ...current, url, error: null })
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="link-inserter-actions">
        <button type="button" className="button button-small" onClick={insert}>
          Insert link
        </button>
        <button type="button" className="button button-secondary button-small" onClick={() => setDraft(null)}>
          Cancel
        </button>
      </div>
      {draft.error && (
        <p className="field-error" id={errorId}>
          {draft.error}
        </p>
      )}
    </div>
  )
}
