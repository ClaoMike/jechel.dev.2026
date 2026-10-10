import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { PencilIcon } from '../../components/icons'
import { ApiError } from '../../services/api'
import type { EditorProps, FieldErrors } from './fields'

interface EditableSectionProps<T> {
  title: string
  /** Visually hide the heading (it stays for screen readers), e.g. for the profile card. */
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
  /** Saves; rejects with an ApiError on failure. */
  onSave: (value: T) => Promise<void>
  /** The read-only view. */
  children: ReactNode
  /**
   * The edit form. Called as a plain function, not mounted as a component, so it must not use
   * hooks itself: return a component that does, e.g. `(props) => <MyEditor {...props} />`.
   */
  editor: (props: EditorProps<T>) => ReactNode
}

type Status = { state: 'viewing' } | { state: 'editing' | 'saving'; draft: unknown; errors: FieldErrors; message: string | null }

/** A section of the About Me page that the admin can switch into an edit form, then save or cancel. */
export function EditableSection<T>({ title, hideTitle = false, editLabel, className = '', errorKeys, value, canEdit, onSave, children, editor }: EditableSectionProps<T>) {
  const headingId = useId()
  const [status, setStatus] = useState<Status>({ state: 'viewing' })
  const editing = status.state !== 'viewing' && canEdit

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status.state !== 'editing') return
    setStatus({ ...status, state: 'saving', message: null })
    try {
      await onSave(status.draft as T)
      setStatus({ state: 'viewing' })
    } catch (error) {
      setStatus({ ...status, state: 'editing', ...describeError(error, errorKeys) })
    }
  }

  return (
    <section className={`card about-section ${className}`} aria-labelledby={headingId}>
      <div className={hideTitle ? 'about-section-header about-section-header-floating' : 'about-section-header'}>
        <h2 id={headingId} className={hideTitle ? 'visually-hidden' : undefined}>
          {title}
        </h2>
        {canEdit && !editing && (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => setStatus({ state: 'editing', draft: structuredClone(value), errors: {}, message: null })}
          >
            <PencilIcon size={16} />
            Edit <span className="visually-hidden">{editLabel ?? title}</span>
          </button>
        )}
      </div>

      {editing ? (
        <form className="about-editor" noValidate onSubmit={(event) => void handleSubmit(event)} aria-label={`Edit ${editLabel ?? title}`}>
          {editor({
            value: status.draft as T,
            onChange: (draft) => setStatus({ ...status, draft }),
            update: (change) => setStatus((current) => (current.state === 'viewing' ? current : { ...current, draft: change(current.draft as T) })),
            errors: status.errors,
          })}
          {status.message && (
            <p role="alert" className="form-error">
              {status.message}
            </p>
          )}
          <div className="about-editor-actions">
            <button type="submit" className="button" disabled={status.state === 'saving'}>
              {status.state === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="button button-secondary" disabled={status.state === 'saving'} onClick={() => setStatus({ state: 'viewing' })}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        children
      )}
    </section>
  )
}

/** Section titles by the first part of an API error key, for errors raised by another section. */
const SECTION_TITLES: Record<string, string> = {
  photoUrl: 'Photo and links',
  links: 'Photo and links',
  places: "Where I've been",
  'colors.places': "Where I've been",
  skills: 'Skills',
  'colors.skills': 'Skills',
  experience: 'Work experience',
  education: 'Education',
  papers: 'Academic papers',
  qualifications: 'Qualifications',
}

const owns = (prefixes: string[], key: string) => prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}[`))

/** "skills[2].periods[0].uses" → "Skills, item 3". */
function describeErrorKey(key: string): string {
  const section = Object.keys(SECTION_TITLES).find((prefix) => owns([prefix], key))
  const title = section ? SECTION_TITLES[section] : key
  const index = /^[a-z]+\[(\d+)\]/i.exec(key)?.[1]
  return index === undefined ? title : `${title}, item ${Number(index) + 1}`
}

function describeError(error: unknown, errorKeys: string[]): { errors: FieldErrors; message: string } {
  if (error instanceof ApiError && error.validationErrors) {
    const errors: FieldErrors = {}
    const elsewhere: string[] = []
    for (const [key, messages] of Object.entries(error.validationErrors)) {
      errors[key] = messages[0]
      if (!owns(errorKeys, key)) elsewhere.push(`${describeErrorKey(key)}: ${messages[0]}`)
    }
    if (elsewhere.length > 0) {
      const more = elsewhere.length > 3 ? ` (and ${elsewhere.length - 3} more)` : ''
      return { errors, message: `Couldn't save, because another section needs fixing first. ${elsewhere.slice(0, 3).join(' ')}${more}` }
    }
    return { errors, message: 'Some fields need fixing; see the messages above.' }
  }
  if (error instanceof ApiError && error.status === 401) {
    return { errors: {}, message: 'Your session has ended. Sign in again, then save.' }
  }
  return { errors: {}, message: "Couldn't save. Please try again." }
}
