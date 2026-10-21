import type { EditorProps } from '../../../../components/fields'
import type { Paper } from '../../../../services/api'
import { move, removeAt, replaceAt } from '../../list'

/** Every paper as a row: changed, moved, removed; its PDF set when an upload finishes (on the latest list). */
export function usePapersEditorViewModel({ value, onChange, update, errors }: EditorProps<Paper[]>) {
  return {
    rows: value.map((paper, i) => ({
      key: i,
      index: i,
      count: value.length,
      paper,
      titleError: errors[`papers[${i}].title`],
      fileError: errors[`papers[${i}].fileUrl`],
      onChange: (next: Paper) => onChange(replaceAt(value, i, next)),
      // Uploads finish later: change the latest list, not the one the upload started from.
      setFile: (fileUrl: string) => update((current) => current.map((p, j) => (j === i ? { ...p, fileUrl } : p))),
      onMove: (from: number, to: number) => onChange(move(value, from, to)),
      onRemove: () => onChange(removeAt(value, i)),
    })),
    listError: errors.papers,
    add: () => onChange([...value, { title: '', fileUrl: '' }]),
  }
}
