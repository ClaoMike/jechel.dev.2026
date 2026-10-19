import { AddButton, type EditorProps } from '../../../../components/fields'
import type { Hackathon } from '../../../../services/api'
import { SortableListHeader } from '../../section/SortableListHeader/SortableListHeader'
import { HackathonEditor } from '../HackathonEditor/HackathonEditor'
import { useHackathonsEditorViewModel } from './HackathonsEditor.viewModel'

/** Every hackathon, reorderable and sortable by year; new ones go on top. */
export function HackathonsEditor(props: EditorProps<Hackathon[]>) {
  const vm = useHackathonsEditorViewModel(props)
  return (
    <div className="editor-list">
      <SortableListHeader {...vm.header} />
      {vm.rows.map(({ key, ...row }) => (
        <HackathonEditor key={key} {...row} />
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>Add hackathon</AddButton>
    </div>
  )
}
