import { useState } from 'react'
import { AddButton, type EditorProps } from '../../../../components/fields'
import { move, removeAt, replaceAt, sortByEndDate } from '../../list'
import { SortableListHeader } from '../../section/SortableListHeader/SortableListHeader'
import { newEntry, type TimelineConfig, type TimelineEntry } from '../timeline'
import { TimelineEntryEditor } from '../TimelineEntryEditor/TimelineEntryEditor'
import { strings } from '../../../../strings'

export interface TimelineEditorProps<T> extends EditorProps<T[]> {
  config: TimelineConfig<T>
}

/** Every entry of work experience or education, reorderable and sortable by end date; new ones go on top. */
export function TimelineEditor<T>({ config, value: items, onChange: onItemsChange, errors }: TimelineEditorProps<T>) {
  const value = items.map(config.toEntry)
  const [sorted, setSorted] = useState(false)
  const onChange = (entries: TimelineEntry[]) => onItemsChange(entries.map(config.fromEntry))
  const change = (entries: TimelineEntry[]) => {
    setSorted(false)
    onChange(entries)
  }

  return (
    <div className="editor-list">
      <SortableListHeader
        sortLabel={strings.timelineEditor.sortEndDate}
        sortedMessage={strings.timelineEditor.sortedEndDateOngoing}
        canSort={value.length >= 2}
        sorted={sorted}
        sort={() => {
          onChange(sortByEndDate(value))
          setSorted(true)
        }}
      />
      {value.map((entry, i) => (
        <TimelineEntryEditor
          key={i}
          config={config}
          index={i}
          count={value.length}
          entry={entry}
          errors={errors}
          onChange={(next) => change(replaceAt(value, i, next))}
          onMove={(from, to) => change(move(value, from, to))}
          onRemove={() => change(removeAt(value, i))}
        />
      ))}
      {errors[config.key] && <p className="field-error">{errors[config.key]}</p>}
      <AddButton onClick={() => change([newEntry(config.withBullets), ...value])}>
        {strings.timelineEditor.add}
        {config.itemName}
      </AddButton>
    </div>
  )
}
