import { useId, useState, type FormEvent } from 'react'
import { failureOf } from '../../../services/api'
import type { FieldErrors } from '../../../utils/saveErrors'
import type { EditorProps } from '../fields/fields'

type Status = { state: 'viewing' } | { state: 'editing' | 'saving'; draft: unknown; errors: FieldErrors; message: string | null }

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

/** Section titles by the first part of an API error key, for errors raised by another section. */
const SECTION_TITLES: Record<string, string> = {
  photoUrl: 'Photo and links',
  statuses: 'Photo and links',
  links: 'Photo and links',
  places: "Where I've been",
  'colors.places': "Where I've been",
  problemSolving: 'Problem solving',
  skills: 'Skills',
  'colors.skills': 'Skills',
  experience: 'Work experience',
  education: 'Education',
  papers: 'Academic papers',
  qualifications: 'Qualifications',
  languages: 'Languages',
  licences: 'Licences',
  hackathons: 'Hackathons',
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
  const { status, validationErrors } = failureOf(error)
  if (validationErrors) {
    const errors: FieldErrors = {}
    const elsewhere: string[] = []
    for (const [key, messages] of Object.entries(validationErrors)) {
      errors[key] = messages[0]
      if (!owns(errorKeys, key)) elsewhere.push(`${describeErrorKey(key)}: ${messages[0]}`)
    }
    if (elsewhere.length > 0) {
      const more = elsewhere.length > 3 ? ` (and ${elsewhere.length - 3} more)` : ''
      return { errors, message: `Couldn't save, because another section needs fixing first. ${elsewhere.slice(0, 3).join(' ')}${more}` }
    }
    return { errors, message: 'Some fields need fixing; see the messages above.' }
  }
  if (status === 401) return { errors: {}, message: 'Your session has ended. Sign in again, then save.' }
  return { errors: {}, message: "Couldn't save. Please try again." }
}

export interface EditableSectionOptions<T> {
  title: string
  /** The API error keys this section shows, as path prefixes (errors for others are spelled out in the message). */
  errorKeys: string[]
  value: T
  canEdit: boolean
  /** Saves; rejects with an ApiError (or ApiFailure) on failure. */
  onSave: (value: T) => Promise<void>
}

/** Collapsing (anyone), and the admin's draft of the section: edit, save or cancel. */
export function useEditableSectionViewModel<T>({ title, errorKeys, value, canEdit, onSave }: EditableSectionOptions<T>) {
  const [status, setStatus] = useState<Status>({ state: 'viewing' })
  const [collapsed, setCollapsed] = useCollapsed(title)
  const editing = status.state !== 'viewing' && canEdit
  // An open form is always shown.
  const open = !collapsed || editing

  async function submit(event: FormEvent<HTMLFormElement>) {
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
    headingId: useId(),
    bodyId: useId(),
    editing,
    open,
    saving: status.state === 'saving',
    message: status.state === 'viewing' ? null : status.message,
    editorProps,
    edit: () => setStatus({ state: 'editing', draft: structuredClone(value), errors: {}, message: null }),
    cancel: () => setStatus({ state: 'viewing' }),
    toggleCollapsed: () => setCollapsed(open),
    submit: (event: FormEvent<HTMLFormElement>) => void submit(event),
  }
}
