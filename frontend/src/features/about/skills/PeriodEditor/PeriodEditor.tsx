import { CheckboxGroup, ItemControls, MonthField } from '../../../../components/fields'
import { usePeriodEditorViewModel, type PeriodEditorProps } from './PeriodEditor.viewModel'

/** One period of a skill: from, to (or still using it), and what it was used for. */
export function PeriodEditor(props: PeriodEditorProps) {
  const { name, label, period, onRemove } = props
  const vm = usePeriodEditorViewModel(props)

  return (
    <div className="editor-subitem" role="group" aria-label={label}>
      <div className="editor-period">
        <MonthField label="From" value={period.start} onChange={vm.setStart} error={vm.startError} />
        {period.end !== null && <MonthField label="To" value={period.end} onChange={vm.setEnd} error={vm.endError} />}
        <div className="checkbox-field">
          <input id={vm.ongoingId} type="checkbox" checked={vm.ongoing} onChange={(e) => vm.setOngoing(e.target.checked)} />
          <label htmlFor={vm.ongoingId}>Still using it</label>
        </div>
        <ItemControls name={name} index={0} count={1} onRemove={onRemove} />
      </div>
      <CheckboxGroup label="Used for" options={vm.useOptions} value={period.uses} onChange={vm.setUses} labelFor={vm.useLabel} colorFor={vm.useColor} error={vm.usesError} />
    </div>
  )
}
