import { AddButton, type EditorProps } from '../../../../components/fields'
import type { Paper } from '../../../../services/api'
import { PaperEditor } from '../PaperEditor/PaperEditor'
import { usePapersEditorViewModel } from './PapersEditor.viewModel'

/** Every paper's title and PDF, reorderable. */
export function PapersEditor(props: EditorProps<Paper[]>) {
  const vm = usePapersEditorViewModel(props)
  return (
    <div className="editor-list">
      {vm.rows.map(({ key, ...row }) => (
        <PaperEditor key={key} {...row} />
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>Add paper</AddButton>
    </div>
  )
}
