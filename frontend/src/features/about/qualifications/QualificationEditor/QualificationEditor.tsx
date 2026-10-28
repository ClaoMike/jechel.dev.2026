import { ItemControls, MonthField, TextField } from '../../../../components/fields'
import type { Qualification } from '../../../../services/api'

export interface QualificationEditorProps {
  index: number
  count: number
  item: Qualification
  errors: { title?: string; issuer?: string; obtained?: string; grade?: string }
  onChange: (item: Qualification) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One qualification: what, issued by whom, when, and the grade. */
export function QualificationEditor({ index, count, item, errors, onChange, onMove, onRemove }: QualificationEditorProps) {
  const set = (patch: Partial<Qualification>) => onChange({ ...item, ...patch })
  return (
    <fieldset className="editor-item">
      <legend>Qualification {index + 1}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={`qualification ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label="Qualification" value={item.title} required onChange={(title) => set({ title })} error={errors.title} allowLinks />
        <TextField label="Issued by (optional)" value={item.issuer} onChange={(issuer) => set({ issuer })} error={errors.issuer} allowLinks />
      </div>
      <div className="editor-period">
        <MonthField label="Obtained" value={item.obtained ?? ''} onChange={(obtained) => set({ obtained })} error={errors.obtained} />
        <TextField label="Grade (optional)" value={item.grade} onChange={(grade) => set({ grade })} error={errors.grade} placeholder="e.g. First Class, 870/1000" />
      </div>
    </fieldset>
  )
}
