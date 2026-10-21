import { ItemControls, TextField } from '../../../../components/fields'
import { BulletsEditor } from '../../section/BulletsEditor/BulletsEditor'
import { useHackathonEditorViewModel, type HackathonEditorProps } from './HackathonEditor.viewModel'

/** One hackathon: name, year, and what happened. */
export function HackathonEditor(props: HackathonEditorProps) {
  const { index, count, hackathon, onMove, onRemove } = props
  const vm = useHackathonEditorViewModel(props)

  return (
    <fieldset className="editor-item">
      <legend>{vm.legend}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={vm.name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label="Name" value={hackathon.name} required onChange={vm.setName} error={vm.nameError} allowLinks />
        <div className="field">
          <label htmlFor={vm.yearId}>Year</label>
          <input
            id={vm.yearId}
            className="year-input"
            inputMode="numeric"
            maxLength={4}
            value={vm.year}
            aria-invalid={vm.yearInvalid || undefined}
            aria-describedby={vm.yearErrorId}
            onChange={(e) => vm.setYear(e.target.value)}
          />
          {vm.yearError && (
            <p className="field-error" id={vm.yearErrorId}>
              {vm.yearError}
            </p>
          )}
        </div>
      </div>
      <div className="editor-bullets">
        <span className="field-label">What happened</span>
        <BulletsEditor itemName="bullet point" value={hackathon.bullets} onChange={vm.setBullets} errorFor={vm.bulletError} listError={vm.bulletsError} />
      </div>
    </fieldset>
  )
}
