import { ItemControls, TextField } from '../../../../components/fields'
import { Flag } from '../../Flag'
import { useStatusEditorViewModel, type StatusEditorProps } from './StatusEditor.viewModel'

/** One label under the photo: its flag and text, with move and remove. */
export function StatusEditor(props: StatusEditorProps) {
  const { index, count, status, error, onMove, onRemove } = props
  const vm = useStatusEditorViewModel(props)
  return (
    <div className="status-editor" role="group" aria-label={vm.groupLabel}>
      <div className="field">
        <label htmlFor={vm.flagId}>Flag</label>
        <div className="status-flag">
          <Flag code={status.flag} />
          <select id={vm.flagId} className="select" value={status.flag} onChange={(e) => vm.setFlag(e.target.value)}>
            <option value="">No flag</option>
            {vm.flags.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <TextField label="Label" value={status.text} required onChange={vm.setText} error={error} />
      <ItemControls name={vm.name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
    </div>
  )
}
