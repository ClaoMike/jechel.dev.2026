import { AddButton, type EditorProps } from '../../../../components/fields'
import type { Paper } from '../../../../services/api'
import { PaperEditor } from '../PaperEditor/PaperEditor'
import { move, removeAt, replaceAt } from '../../list'

/** Every paper's title and PDF, reorderable. */
export function PapersEditor({ value, onChange, update, errors }: EditorProps<Paper[]>) {
  return (
    <div className="editor-list">
      {value.map((paper, i) => (
        <PaperEditor
          key={i}
          index={i}
          count={value.length}
          paper={paper}
          titleError={errors[`papers[${i}].title`]}
          fileError={errors[`papers[${i}].fileUrl`]}
          onChange={(next) => onChange(replaceAt(value, i, next))}
          // Uploads finish later: change the latest list, not the one the upload started from.
          setFile={(fileUrl) => update((current) => current.map((p, j) => (j === i ? { ...p, fileUrl } : p)))}
          onMove={(from, to) => onChange(move(value, from, to))}
          onRemove={() => onChange(removeAt(value, i))}
        />
      ))}
      {errors.papers && <p className="field-error">{errors.papers}</p>}
      <AddButton onClick={() => onChange([...value, { title: '', fileUrl: '' }])}>Add paper</AddButton>
    </div>
  )
}
