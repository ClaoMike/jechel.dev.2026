import { AddButton, ItemControls, TextField } from '../../../../components/fields'
import { useBulletsEditorViewModel, type BulletsEditorProps } from './BulletsEditor.viewModel'

/** Edits a list of strings: one text box per bullet, reorderable. Empty bullets are dropped on save. */
export function BulletsEditor(props: BulletsEditorProps) {
  const vm = useBulletsEditorViewModel(props)
  return (
    <div className="editor-list">
      {vm.rows.map((row) => (
        <div key={row.key} className="editor-bullet">
          <TextField label={row.label} value={row.text} multiline={props.multiline} onChange={row.onChange} error={row.error} allowLinks />
          <ItemControls name={row.name} index={row.index} count={row.count} onMove={row.onMove} onRemove={row.onRemove} />
        </div>
      ))}
      {props.listError && <p className="field-error">{props.listError}</p>}
      <AddButton onClick={vm.add}>{vm.addLabel}</AddButton>
    </div>
  )
}
