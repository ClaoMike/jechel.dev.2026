import { useState } from 'react'
import type { EditorProps } from '../../../../components/fields'
import { move, removeAt, replaceAt, sortByEndDate } from '../../list'
import { newEntry, type TimelineConfig, type TimelineEntry } from '../timeline'

export interface TimelineEditorProps<T> extends EditorProps<T[]> {
  config: TimelineConfig<T>
}

/** The entries in their shown order (moved, changed, removed, a new one on top), and sorting them by end date. */
export function useTimelineEditorViewModel<T>({ config, value: items, onChange: onItemsChange, errors }: TimelineEditorProps<T>) {
  const value = items.map(config.toEntry)
  const [sorted, setSorted] = useState(false)
  const onChange = (entries: TimelineEntry[]) => onItemsChange(entries.map(config.fromEntry))
  const change = (entries: TimelineEntry[]) => {
    setSorted(false)
    onChange(entries)
  }

  return {
    header: {
      sortLabel: 'Sort by end date',
      sortedMessage: 'Sorted by end date, ongoing first. Save to keep this order, or Cancel to undo.',
      canSort: value.length >= 2,
      sorted,
      sort: () => {
        onChange(sortByEndDate(value))
        setSorted(true)
      },
    },
    entries: value.map((entry, i) => ({
      key: i,
      config,
      index: i,
      count: value.length,
      entry,
      errors,
      onChange: (next: TimelineEntry) => change(replaceAt(value, i, next)),
      onMove: (from: number, to: number) => change(move(value, from, to)),
      onRemove: () => change(removeAt(value, i)),
    })),
    listError: errors[config.key],
    addLabel: `Add ${config.itemName}`,
    add: () => change([newEntry(config.withBullets), ...value]),
  }
}
