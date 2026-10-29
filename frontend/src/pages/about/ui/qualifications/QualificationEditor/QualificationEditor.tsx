import { ItemControls, MonthField, TextField } from '@/shared/ui/fields'
import type { Qualification } from '@/shared/api'
import { strings } from '@/shared/i18n'

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
      <legend>
        {strings.qualificationEditor.qualification}
        {index + 1}
      </legend>
      <div className="editor-item-toolbar">
        <ItemControls name={`qualification ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label={strings.qualificationEditor.qualification2} value={item.title} required onChange={(title) => set({ title })} error={errors.title} allowLinks />
        <TextField label={strings.qualificationEditor.issuedOptional} value={item.issuer} onChange={(issuer) => set({ issuer })} error={errors.issuer} allowLinks />
      </div>
      <div className="editor-period">
        <MonthField label={strings.qualificationEditor.obtained} value={item.obtained ?? ''} onChange={(obtained) => set({ obtained })} error={errors.obtained} />
        <TextField
          label={strings.qualificationEditor.gradeOptional}
          value={item.grade}
          onChange={(grade) => set({ grade })}
          error={errors.grade}
          placeholder={strings.qualificationEditor.eGFirstClass}
        />
      </div>
    </fieldset>
  )
}
