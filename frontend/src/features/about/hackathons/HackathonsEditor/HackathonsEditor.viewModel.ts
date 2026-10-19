import { useState } from 'react'
import type { EditorProps } from '../../../../components/fields'
import type { Hackathon } from '../../../../services/api'
import { move, removeAt, replaceAt, sortByYear } from '../../list'

/** The hackathons in their shown order (moved, changed, removed, a new one on top), and sorting them by year. */
export function useHackathonsEditorViewModel({ value, onChange, errors }: EditorProps<Hackathon[]>) {
  const [sorted, setSorted] = useState(false)
  const change = (next: Hackathon[]) => {
    setSorted(false)
    onChange(next)
  }
  return {
    header: {
      note: 'Shown in this order. Move entries with the arrows, or sort them by year.',
      sortLabel: 'Sort by year',
      sortedMessage: 'Sorted by year, newest first. Save to keep this order, or Cancel to undo.',
      canSort: value.length >= 2,
      sorted,
      sort: () => {
        onChange(sortByYear(value))
        setSorted(true)
      },
    },
    rows: value.map((hackathon, i) => ({
      key: i,
      index: i,
      count: value.length,
      hackathon,
      errors,
      onChange: (next: Hackathon) => change(replaceAt(value, i, next)),
      onMove: (from: number, to: number) => change(move(value, from, to)),
      onRemove: () => change(removeAt(value, i)),
    })),
    listError: errors.hackathons,
    add: () => change([{ name: '', year: new Date().getFullYear(), bullets: [''] }, ...value]),
  }
}
