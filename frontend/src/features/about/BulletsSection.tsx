import { AddButton, ItemControls, TextField } from './fields'
import { move, removeAt, replaceAt } from './list'

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
          <TextField label={`${label} ${i + 1}`} value={text} multiline={multiline} onChange={(next) => onChange(replaceAt(value, i, next))} error={errorFor(i)} allowLinks />
          <ItemControls name={`${itemName} ${i + 1}`} index={i} count={value.length} onMove={(from, to) => onChange(move(value, from, to))} onRemove={() => onChange(removeAt(value, i))} />
        </div>
      ))}
      {listError && <p className="field-error">{listError}</p>}
      <AddButton onClick={() => onChange([...value, ''])}>Add {itemName}</AddButton>
    </div>
  )
}
