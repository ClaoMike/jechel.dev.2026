import { AddButton, type EditorProps } from '../../../../components/fields'
import type { Qualification } from '../../../../services/api'
import { currentMonth } from '../../format'
import { move, removeAt, replaceAt } from '../../list'
import { QualificationEditor } from '../QualificationEditor/QualificationEditor'

/** Every qualification, reorderable; a new one is dated this month. */
export function QualificationsEditor({ value, onChange, errors }: EditorProps<Qualification[]>) {
  return (
    <div className="editor-list">
      {value.map((item, i) => {
        const key = `qualifications[${i}]`
        return (
          <QualificationEditor
            key={i}
            index={i}
            count={value.length}
            item={item}
            errors={{ title: errors[`${key}.title`], issuer: errors[`${key}.issuer`], obtained: errors[`${key}.obtained`], grade: errors[`${key}.grade`] }}
            onChange={(next) => onChange(replaceAt(value, i, next))}
            onMove={(from, to) => onChange(move(value, from, to))}
            onRemove={() => onChange(removeAt(value, i))}
          />
        )
      })}
      {errors.qualifications && <p className="field-error">{errors.qualifications}</p>}
      <AddButton onClick={() => onChange([...value, { title: '', issuer: '', obtained: currentMonth(), grade: '' }])}>Add qualification</AddButton>
    </div>
  )
}
