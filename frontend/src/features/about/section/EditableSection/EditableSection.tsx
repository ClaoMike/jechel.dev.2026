import { SectionEditorForm } from '../SectionEditorForm/SectionEditorForm'
import { SectionHeader } from '../SectionHeader/SectionHeader'
import { useEditableSectionViewModel, type EditableSectionProps } from './EditableSection.viewModel'

/**
 * A section of the About Me page. Anyone can collapse it (remembered in this browser); the admin
 * can switch it into an edit form, then save or cancel.
 */
export function EditableSection<T>(props: EditableSectionProps<T>) {
  const { children, editor: Editor } = props
  const vm = useEditableSectionViewModel(props)

  return (
    <section className={vm.className} aria-labelledby={vm.headingId}>
      <SectionHeader {...vm.header} />
      <div id={vm.bodyId} hidden={!vm.open}>
        {vm.form && vm.editorProps ? (
          <SectionEditorForm {...vm.form}>
            <Editor {...vm.editorProps} />
          </SectionEditorForm>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
