import { AddButton, type EditorProps } from '../../../../components/fields'
import { ColorsFieldset } from '../../section/ColorsFieldset/ColorsFieldset'
import { SortableListHeader } from '../../section/SortableListHeader/SortableListHeader'
import { SkillEditor } from '../SkillEditor/SkillEditor'
import type { SkillsValue } from '../skills'
import { useSkillsEditorViewModel } from './SkillsEditor.viewModel'

/** The colour of each use, then every skill (folded until clicked open), reorderable and sortable. */
export function SkillsEditor(props: EditorProps<SkillsValue>) {
  const vm = useSkillsEditorViewModel(props)
  return (
    <div className="editor-list">
      <SortableListHeader {...vm.header} />
      <ColorsFieldset colors={vm.colors} />
      {vm.skills.map(({ key, ...skill }) => (
        <SkillEditor key={key} {...skill} />
      ))}
      {vm.listError && <p className="field-error">{vm.listError}</p>}
      <AddButton onClick={vm.add}>Add skill</AddButton>
    </div>
  )
}
