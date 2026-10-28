import type { FieldErrors } from '../../utils/saveErrors'
import { strings } from '../../strings'

/** API field errors, first message per path, e.g. { "experience[0].title": "Required." }. */
export type { FieldErrors }

/** What an editor gets from the section or popup it's in: the draft, and ways to change it. */
export interface EditorProps<T> {
  value: T
  onChange: (value: T) => void
  /** Changes the draft from its latest value: for async callbacks (uploads) that would otherwise overwrite each other. */
  update: (change: (current: T) => T) => void
  errors: FieldErrors
}

/** Under "Remove …?" in the editors: nothing is lost until the section is saved. */
export const REMOVE_DETAIL = strings.editor.goesWhenSaveSection
