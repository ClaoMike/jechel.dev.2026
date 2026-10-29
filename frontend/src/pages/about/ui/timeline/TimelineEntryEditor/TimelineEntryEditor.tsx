import { useId } from 'react'
import { ItemControls, MonthField, TextField, type FieldErrors } from '@/shared/ui/fields'
import { BulletsEditor } from '@/shared/ui/fields'
import type { TimelineConfig, TimelineEntry } from '../../../lib/timeline'
import { strings } from '@/shared/i18n'

export interface TimelineEntryEditorProps<T> {
  config: TimelineConfig<T>
  index: number
  count: number
  entry: TimelineEntry
  errors: FieldErrors
  onChange: (entry: TimelineEntry) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/**
 * One role or course: what, where, from when to when (or ongoing), and (work only) what was done. Its errors are keyed
 * like the API's: "experience[0].company".
 */
export function TimelineEntryEditor<T>({ config, index, count, entry, errors, onChange, onMove, onRemove }: TimelineEntryEditorProps<T>) {
  const ongoingId = useId()
  const name = `${config.itemName} ${index + 1}`
  const prefix = `${config.key}[${index}]`
  const errorAt = (field: string) => errors[`${prefix}.${field}`]
  const set = (patch: Partial<TimelineEntry>) => onChange({ ...entry, ...patch })

  return (
    <fieldset className="editor-item">
      <legend>{name.charAt(0).toUpperCase() + name.slice(1)}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label={config.titleLabel} value={entry.title} required onChange={(title) => set({ title })} error={errorAt('title')} allowLinks />
        <TextField
          label={config.organizationLabel}
          value={entry.organization}
          required
          onChange={(organization) => set({ organization })}
          error={errorAt(config.organizationKey)}
          allowLinks
        />
        <TextField label={strings.timelineEntryEditor.locationOptional} value={entry.location} onChange={(location) => set({ location })} error={errorAt('location')} allowLinks />
      </div>
      <div className="editor-period">
        <MonthField label={strings.timelineEntryEditor.start} value={entry.start} onChange={(start) => set({ start })} error={errorAt('start')} />
        {entry.end !== null && <MonthField label={strings.timelineEntryEditor.end} value={entry.end} onChange={(end) => set({ end })} error={errorAt('end')} />}
        <div className="checkbox-field">
          {/* Unticking "Ongoing" ends it where it started; the admin moves the end from there. */}
          <input id={ongoingId} type="checkbox" checked={entry.end === null} onChange={(e) => set({ end: e.target.checked ? null : entry.start })} />
          <label htmlFor={ongoingId}>{strings.timelineEntryEditor.ongoingNoEndDate}</label>
        </div>
      </div>
      {entry.bullets && (
        <div className="editor-bullets">
          <span className="field-label">{strings.timelineEntryEditor.whatDid}</span>
          <BulletsEditor
            itemName={strings.common.bulletPoint}
            value={entry.bullets}
            onChange={(bullets) => set({ bullets })}
            errorFor={(i) => errors[`${prefix}.bullets[${i}]`]}
            listError={errorAt('bullets')}
          />
        </div>
      )}
    </fieldset>
  )
}
