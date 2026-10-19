import { AddButton, type EditorProps } from '../../../../components/fields'
import type { Qualification } from '../../../../services/api'
import { QualificationEditor } from '../QualificationEditor/QualificationEditor'
import { useQualificationsEditorViewModel } from './QualificationsEditor.viewModel'

/** Every qualification, reorderable. */
export function QualificationsEditor(props: EditorProps<Qualification[]>) {
  const vm = useQualificationsEditorViewModel(props)
  return (
    <div className="editor-list">
      {vm.rows.map(({ key, ...row }) => (
        <QualificationEditor key={key} {...row} />
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>Add qualification</AddButton>
    </div>
  )
}
