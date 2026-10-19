import { AddButton } from '../../../../components/fields'
import { SortableListHeader } from '../../section/SortableListHeader/SortableListHeader'
import { TimelineEntryEditor } from '../TimelineEntryEditor/TimelineEntryEditor'
import { useTimelineEditorViewModel, type TimelineEditorProps } from './TimelineEditor.viewModel'

/** Every entry of work experience or education, reorderable and sortable; new ones go on top. */
export function TimelineEditor<T>(props: TimelineEditorProps<T>) {
  const vm = useTimelineEditorViewModel(props)
  return (
    <div className="editor-list">
      <SortableListHeader {...vm.header} />
      {vm.entries.map(({ key, ...entry }) => (
        <TimelineEntryEditor key={key} {...entry} />
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>{vm.addLabel}</AddButton>
    </div>
  )
}
