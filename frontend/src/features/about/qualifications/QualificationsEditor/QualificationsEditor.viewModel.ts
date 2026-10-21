import type { EditorProps } from '../../../../components/fields'
import type { Qualification } from '../../../../services/api'
import { currentMonth } from '../../format'
import { move, removeAt, replaceAt } from '../../list'

/** Every qualification as a row with its errors; a new one dated this month. */
export function useQualificationsEditorViewModel({ value, onChange, errors }: EditorProps<Qualification[]>) {
  return {
    rows: value.map((item, i) => {
      const key = `qualifications[${i}]`
      return {
        key: i,
        index: i,
        count: value.length,
        item,
        errors: { title: errors[`${key}.title`], issuer: errors[`${key}.issuer`], obtained: errors[`${key}.obtained`], grade: errors[`${key}.grade`] },
        onChange: (next: Qualification) => onChange(replaceAt(value, i, next)),
        onMove: (from: number, to: number) => onChange(move(value, from, to)),
        onRemove: () => onChange(removeAt(value, i)),
      }
    }),
    listError: errors.qualifications,
    add: () => onChange([...value, { title: '', issuer: '', obtained: currentMonth(), grade: '' }]),
  }
}
