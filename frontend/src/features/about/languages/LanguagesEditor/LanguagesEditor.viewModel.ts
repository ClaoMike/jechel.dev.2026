import type { EditorProps } from '../../../../components/fields'
import type { Language } from '../../../../services/api'
import { move, removeAt, replaceAt } from '../../list'

/** Every language as a row with its errors; a new one starts as a beginner. */
export function useLanguagesEditorViewModel({ value, onChange, errors }: EditorProps<Language[]>) {
  return {
    rows: value.map((language, i) => ({
      key: i,
      index: i,
      count: value.length,
      language,
      nameError: errors[`languages[${i}].name`],
      levelError: errors[`languages[${i}].level`],
      onChange: (next: Language) => onChange(replaceAt(value, i, next)),
      onMove: (from: number, to: number) => onChange(move(value, from, to)),
      onRemove: () => onChange(removeAt(value, i)),
    })),
    listError: errors.languages,
    add: () => onChange([...value, { name: '', level: 'beginner' }]),
  }
}
