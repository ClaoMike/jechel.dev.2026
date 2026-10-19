import { ItemControls, MonthField, TextField } from '../../../../components/fields'
import { BulletsEditor } from '../../section/BulletsEditor/BulletsEditor'
import { useTimelineEntryEditorViewModel, type TimelineEntryEditorProps } from './TimelineEntryEditor.viewModel'

/** One role or course: what, where, from when to when (or ongoing), and (work only) what was done. */
export function TimelineEntryEditor<T>(props: TimelineEntryEditorProps<T>) {
  const { index, count, entry, onMove, onRemove } = props
  const vm = useTimelineEntryEditorViewModel(props)

  return (
    <fieldset className="editor-item">
      <legend>{vm.legend}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={vm.name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label={vm.titleLabel} value={entry.title} required onChange={vm.setTitle} error={vm.errors.title} allowLinks />
        <TextField label={vm.organizationLabel} value={entry.organization} required onChange={vm.setOrganization} error={vm.errors.organization} allowLinks />
        <TextField label="Location (optional)" value={entry.location} onChange={vm.setLocation} error={vm.errors.location} allowLinks />
      </div>
      <div className="editor-period">
        <MonthField label="Start" value={entry.start} onChange={vm.setStart} error={vm.errors.start} />
        {entry.end !== null && <MonthField label="End" value={entry.end} onChange={vm.setEnd} error={vm.errors.end} />}
        <div className="checkbox-field">
          <input id={vm.ongoingId} type="checkbox" checked={vm.ongoing} onChange={(e) => vm.setOngoing(e.target.checked)} />
          <label htmlFor={vm.ongoingId}>Ongoing (no end date)</label>
        </div>
      </div>
      {entry.bullets && (
        <div className="editor-bullets">
          <span className="field-label">What you did</span>
          <BulletsEditor itemName="bullet point" value={entry.bullets} onChange={vm.setBullets} errorFor={vm.bulletError} listError={vm.errors.bullets} />
        </div>
      )}
    </fieldset>
  )
}
