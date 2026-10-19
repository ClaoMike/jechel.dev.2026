import { AddButton, type EditorProps } from '../../../../components/fields'
import type { Language } from '../../../../services/api'
import { LanguageEditor } from '../LanguageEditor/LanguageEditor'
import { useLanguagesEditorViewModel } from './LanguagesEditor.viewModel'

/** Every language and its level, reorderable. */
export function LanguagesEditor(props: EditorProps<Language[]>) {
  const vm = useLanguagesEditorViewModel(props)
  return (
    <div className="editor-list">
      {vm.rows.map(({ key, ...row }) => (
        <LanguageEditor key={key} {...row} />
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>Add language</AddButton>
    </div>
  )
}
