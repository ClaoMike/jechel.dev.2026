import { AddButton, type FieldErrors } from '@/shared/ui/fields'
import type { Status } from '@/shared/api'
import { move, removeAt, replaceAt } from '@/shared/lib/list'
import { StatusEditor } from '../StatusEditor/StatusEditor'
import { strings } from '@/shared/i18n'

export interface StatusesEditorProps {
  value: Status[]
  onChange: (value: Status[]) => void
  errors: FieldErrors
}

/** The labels under the photo: a flag and text each, reorderable. */
export function StatusesEditor({ value, onChange, errors }: StatusesEditorProps) {
  return (
    <div className="editor-list">
      {value.map((status, i) => (
        <StatusEditor
          key={i}
          index={i}
          count={value.length}
          status={status}
          error={errors[`statuses[${i}].text`] ?? errors[`statuses[${i}].flag`]}
          onChange={(next) => onChange(replaceAt(value, i, next))}
          onMove={(from, to) => onChange(move(value, from, to))}
          onRemove={() => onChange(removeAt(value, i))}
        />
      ))}
      {errors.statuses && <p className="field-error">{errors.statuses}</p>}
      <AddButton onClick={() => onChange([...value, { text: '', flag: '' }])}>{strings.statusesEditor.addLabel}</AddButton>
    </div>
  )
}
