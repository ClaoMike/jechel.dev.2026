import type { FieldErrors } from '../../../../components/fields'
import type { Status } from '../../../../services/api'
import { move, removeAt, replaceAt } from '../../list'

export interface StatusesEditorProps {
  value: Status[]
  onChange: (value: Status[]) => void
  errors: FieldErrors
}

/** The labels as editable rows: each with its errors, moved, changed or removed; a new one added. */
export function useStatusesEditorViewModel({ value, onChange, errors }: StatusesEditorProps) {
  return {
    rows: value.map((status, i) => ({
      key: i,
      index: i,
      count: value.length,
      status,
      error: errors[`statuses[${i}].text`] ?? errors[`statuses[${i}].flag`],
      onChange: (next: Status) => onChange(replaceAt(value, i, next)),
      onMove: (from: number, to: number) => onChange(move(value, from, to)),
      onRemove: () => onChange(removeAt(value, i)),
    })),
    listError: errors.statuses,
    add: () => onChange([...value, { text: '', flag: '' }]),
  }
}
