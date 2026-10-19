import { AddButton } from '../../../../components/fields'
import { StatusEditor } from '../StatusEditor/StatusEditor'
import { useStatusesEditorViewModel, type StatusesEditorProps } from './StatusesEditor.viewModel'

/** The labels under the photo: a flag and text each, reorderable. */
export function StatusesEditor(props: StatusesEditorProps) {
  const vm = useStatusesEditorViewModel(props)
  return (
    <div className="editor-list">
      {vm.rows.map(({ key, ...row }) => (
        <StatusEditor key={key} {...row} />
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>Add label</AddButton>
    </div>
  )
}
