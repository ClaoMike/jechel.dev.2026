import { AddButton, ItemControls, TextField } from './fields'
import { EditableSection } from './EditableSection'
import { move, removeAt, replaceAt } from './list'

interface BulletsSectionProps {
  title: string
  /** API key of the list, for its field errors: "papers" → "papers[0]". */
  errorKey: string
  /** What one entry is called in the editor, e.g. "paper". */
  itemName: string
  value: string[]
  canEdit: boolean
  onSave: (value: string[]) => Promise<void>
}

/** A titled list of bullet points, e.g. academic papers or qualifications. */
export function BulletsSection({ title, errorKey, itemName, value, canEdit, onSave }: BulletsSectionProps) {
  return (
    <EditableSection
      title={title}
      value={value}
      canEdit={canEdit}
      onSave={onSave}
      editor={({ value: draft, onChange, errors }) => (
        <BulletsEditor itemName={itemName} value={draft} onChange={onChange} errorFor={(i) => errors[`${errorKey}[${i}]`]} listError={errors[errorKey]} multiline />
      )}
    >
      {value.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ul className="bullets">
          {value.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
    </EditableSection>
  )
}

interface BulletsEditorProps {
  itemName: string
  value: string[]
  onChange: (value: string[]) => void
  errorFor: (index: number) => string | undefined
  listError?: string
  multiline?: boolean
}

/** Edits a list of strings: one text box per bullet, reorderable. Empty bullets are dropped on save. */
export function BulletsEditor({ itemName, value, onChange, errorFor, listError, multiline = false }: BulletsEditorProps) {
  const label = itemName.charAt(0).toUpperCase() + itemName.slice(1)
  return (
    <div className="editor-list">
      {value.map((text, i) => (
        <div key={i} className="editor-bullet">
          <TextField label={`${label} ${i + 1}`} value={text} multiline={multiline} onChange={(next) => onChange(replaceAt(value, i, next))} error={errorFor(i)} />
          <ItemControls name={`${itemName} ${i + 1}`} index={i} count={value.length} onMove={(from, to) => onChange(move(value, from, to))} onRemove={() => onChange(removeAt(value, i))} />
        </div>
      ))}
      {listError && <p className="field-error">{listError}</p>}
      <AddButton onClick={() => onChange([...value, ''])}>Add {itemName}</AddButton>
    </div>
  )
}
