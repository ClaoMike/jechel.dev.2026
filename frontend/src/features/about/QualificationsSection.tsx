import type { Qualification } from '../../services/api'
import { EditableSection } from './EditableSection/EditableSection'
import { AddButton, ItemControls, MonthField, TextField, type EditorProps } from './fields/fields'
import { currentMonth, formatMonth } from './format'
import { move, removeAt, replaceAt } from './list'
import { RichText } from './RichText'

/** Certifications and the like: what, who issued it, when, and the grade if there was one. */
export function QualificationsSection({ value, canEdit, onSave }: { value: Qualification[]; canEdit: boolean; onSave: (value: Qualification[]) => Promise<void> }) {
  return (
    <EditableSection title="Qualifications" errorKeys={['qualifications']} value={value} canEdit={canEdit} onSave={onSave} editor={QualificationsEditor}>
      {value.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="qualifications">
          {value.map((item, i) => (
            <li key={i} className="qualification">
              <span className="qualification-title">
                <RichText text={item.title} />
              </span>
              <span className="qualification-meta">
                {item.issuer && (
                  <span>
                    <RichText text={item.issuer} />
                  </span>
                )}
                {item.obtained && (
                  <span>
                    <time dateTime={item.obtained.slice(0, 7)}>{formatMonth(item.obtained)}</time>
                  </span>
                )}
                {item.grade && <span>Grade: {item.grade}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </EditableSection>
  )
}

function QualificationsEditor({ value, onChange, errors }: EditorProps<Qualification[]>) {
  return (
    <div className="editor-list">
      {value.map((item, i) => {
        const key = `qualifications[${i}]`
        const set = (patch: Partial<Qualification>) => onChange(replaceAt(value, i, { ...item, ...patch }))
        return (
          <fieldset key={i} className="editor-item">
            <legend>Qualification {i + 1}</legend>
            <div className="editor-item-toolbar">
              <ItemControls name={`qualification ${i + 1}`} index={i} count={value.length} onMove={(from, to) => onChange(move(value, from, to))} onRemove={() => onChange(removeAt(value, i))} />
            </div>
            <div className="editor-grid">
              <TextField label="Qualification" value={item.title} required onChange={(title) => set({ title })} error={errors[`${key}.title`]} allowLinks />
              <TextField label="Issued by (optional)" value={item.issuer} onChange={(issuer) => set({ issuer })} error={errors[`${key}.issuer`]} allowLinks />
            </div>
            <div className="editor-period">
              <MonthField label="Obtained" value={item.obtained ?? ''} onChange={(obtained) => set({ obtained })} error={errors[`${key}.obtained`]} />
              <TextField label="Grade (optional)" value={item.grade} onChange={(grade) => set({ grade })} error={errors[`${key}.grade`]} placeholder="e.g. First Class, 870/1000" />
            </div>
          </fieldset>
        )
      })}
      {errors.qualifications && <p className="field-error">{errors.qualifications}</p>}
      <AddButton onClick={() => onChange([...value, { title: '', issuer: '', obtained: currentMonth(), grade: '' }])}>Add qualification</AddButton>
    </div>
  )
}
