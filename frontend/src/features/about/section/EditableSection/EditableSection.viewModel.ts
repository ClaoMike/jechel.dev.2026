import { useId, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import type { EditorProps, FieldErrors } from '../../../../components/fields'
import { describeSaveError } from '../saveError'

type Status = { state: 'viewing' } | { state: 'editing' | 'saving'; draft: unknown; errors: FieldErrors; message: string | null }

export interface EditableSectionProps<T> {
  title: string
  /** Visually hide the heading while the section is open (it stays for screen readers), e.g. for the profile card. */
  hideTitle?: boolean
  /** Shown on the Edit button: "Edit {editLabel}". Defaults to the title. */
  editLabel?: string
  className?: string
  /**
   * The API error keys this section shows, as path prefixes: ["skills", "colors.skills"]. Errors
   * for other keys come from other sections (the whole page is saved), so they're spelled out
   * in the message instead.
   */
  errorKeys: string[]
  value: T
  /** The signed-in admin sees an Edit button. */
  canEdit: boolean
  /** Saves; rejects with an ApiError (or ApiFailure) on failure. */
  onSave: (value: T) => Promise<void>
  /** The read-only view. */
  children: ReactNode
  /** The edit form, given the draft: a component defined once (at module level), not on the spot. */
  editor: ComponentType<EditorProps<T>>
}

/** Whether a section is collapsed, remembered per section in this browser. Storage may be unavailable (private mode): then it isn't remembered. */
function useCollapsed(title: string): [boolean, (collapsed: boolean) => void] {
  const key = `about.collapsed.${title}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  return [
    collapsed,
    (next) => {
      setCollapsed(next)
      try {
        if (next) localStorage.setItem(key, '1')
        else localStorage.removeItem(key)
      } catch {
        // Not remembered, but still collapsed for now.
      }
    },
  ]
}

/** Collapsing (anyone), and the admin's draft of the section: edit, save or cancel. */
export function useEditableSectionViewModel<T>({ title, hideTitle = false, editLabel, className = '', errorKeys, value, canEdit, onSave }: EditableSectionProps<T>) {
  const [status, setStatus] = useState<Status>({ state: 'viewing' })
  const [collapsed, setCollapsed] = useCollapsed(title)
  const editing = status.state !== 'viewing' && canEdit
  // An open form is always shown.
  const open = !collapsed || editing
  const headingId = useId()
  const bodyId = useId()
  const name = editLabel ?? title

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status.state !== 'editing') return
    setStatus({ ...status, state: 'saving', message: null })
    try {
      await onSave(status.draft as T)
      setStatus({ state: 'viewing' })
    } catch (error) {
      setStatus({ ...status, state: 'editing', ...describeSaveError(error, errorKeys) })
    }
  }

  const editorProps: EditorProps<T> | null =
    status.state === 'viewing' || !canEdit
      ? null
      : {
          value: status.draft as T,
          onChange: (draft) => setStatus({ ...status, draft }),
          update: (change) => setStatus((current) => (current.state === 'viewing' ? current : { ...current, draft: change(current.draft as T) })),
          errors: status.errors,
        }

  return {
    headingId,
    bodyId,
    className: ['card', 'about-section', open ? '' : 'about-section-collapsed', className].filter(Boolean).join(' '),
    header: {
      title,
      headingId,
      bodyId,
      /** The heading is out of sight (still read out) while the section is open, e.g. on the profile card. */
      floating: hideTitle && open,
      editLabel: name,
      canEdit: canEdit && !editing,
      canCollapse: !editing,
      open,
      edit: () => setStatus({ state: 'editing', draft: structuredClone(value), errors: {}, message: null }),
      toggleCollapsed: () => setCollapsed(open),
    },
    open,
    form: editorProps && {
      label: `Edit ${name}`,
      saving: status.state === 'saving',
      message: status.state === 'viewing' ? null : status.message,
      submit: (event: FormEvent<HTMLFormElement>) => void submit(event),
      cancel: () => setStatus({ state: 'viewing' }),
    },
    editorProps,
  }
}
