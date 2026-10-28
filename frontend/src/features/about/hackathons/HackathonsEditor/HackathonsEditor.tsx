import { useState } from 'react'
import { AddButton, type EditorProps } from '../../../../components/fields'
import type { Hackathon } from '../../../../services/api'
import { move, removeAt, replaceAt, sortByYear } from '../../list'
import { SortableListHeader } from '../../section/SortableListHeader/SortableListHeader'
import { HackathonEditor } from '../HackathonEditor/HackathonEditor'
import { strings } from '../../../../strings'

/** Every hackathon, reorderable and sortable by year; new ones go on top. */
export function HackathonsEditor({ value, onChange, errors }: EditorProps<Hackathon[]>) {
  const [sorted, setSorted] = useState(false)
  const change = (next: Hackathon[]) => {
    setSorted(false)
    onChange(next)
  }

  return (
    <div className="editor-list">
      <SortableListHeader
        sortLabel={strings.hackathonsEditor.sortYear}
        sortedMessage={strings.hackathonsEditor.sortedYearNewestFirst}
        canSort={value.length >= 2}
        sorted={sorted}
        sort={() => {
          onChange(sortByYear(value))
          setSorted(true)
        }}
      />
      {value.map((hackathon, i) => (
        <HackathonEditor
          key={i}
          index={i}
          count={value.length}
          hackathon={hackathon}
          errors={errors}
          onChange={(next) => change(replaceAt(value, i, next))}
          onMove={(from, to) => change(move(value, from, to))}
          onRemove={() => change(removeAt(value, i))}
        />
      ))}
      {errors.hackathons && <p className="field-error">{errors.hackathons}</p>}
      <AddButton onClick={() => change([{ name: '', year: new Date().getFullYear(), bullets: [''] }, ...value])}>{strings.hackathonsEditor.addHackathon}</AddButton>
    </div>
  )
}
