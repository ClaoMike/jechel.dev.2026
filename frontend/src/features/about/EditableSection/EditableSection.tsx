import type { ReactNode } from 'react'
import { ArrowDownIcon, PencilIcon } from '../../../components/icons/icons'
import { useEditableSectionViewModel } from './EditableSection.viewModel'
import type { EditorProps } from '../fields/fields'

interface EditableSectionProps<T> {
  title: string
  /** Visually hide the heading while the section is open (it stays for screen readers), e.g. for the profile card. */
  hideTitle?: boolean
  /** Shown on the Edit button: "Edit {editLabel}". Defaults to the title. */
  editLabel?: string
  className?: string
  /**
   * The API error keys this section shows, as path prefixes: ["skills", "colors.skills"]. Errors
   * for other keys come from other sections (the whole page is saved), so they're spelled out
   * in the message instead.
   */
  errorKeys: string[]
  value: T
  /** The signed-in admin sees an Edit button. */
  canEdit: boolean
  /** Saves; rejects with an ApiError on failure. */
  onSave: (value: T) => Promise<void>
  /** The read-only view. */
  children: ReactNode
  /**
   * The edit form. Called as a plain function, not mounted as a component, so it must not use
   * hooks itself: return a component that does, e.g. `(props) => <MyEditor {...props} />`.
   */
  editor: (props: EditorProps<T>) => ReactNode
}

/**
 * A section of the About Me page. Anyone can collapse it (remembered in this browser); the admin
 * can switch it into an edit form, then save or cancel.
 */
export function EditableSection<T>({ title, hideTitle = false, editLabel, className = '', errorKeys, value, canEdit, onSave, children, editor }: EditableSectionProps<T>) {
  const vm = useEditableSectionViewModel({ title, errorKeys, value, canEdit, onSave })
  const { headingId, bodyId, editing, open } = vm

  return (
    <section className={`card about-section ${open ? '' : 'about-section-collapsed'} ${className}`} aria-labelledby={headingId}>
      <div className={hideTitle && open ? 'about-section-header about-section-header-floating' : 'about-section-header'}>
        <h2 id={headingId} className={hideTitle && open ? 'visually-hidden' : undefined}>
          {title}
        </h2>
        <div className="about-section-actions">
          {canEdit && !editing && (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={vm.edit}
            >
              <PencilIcon size={16} />
              Edit <span className="visually-hidden">{editLabel ?? title}</span>
            </button>
          )}
          {!editing && (
            <button
              type="button"
              className="icon-button collapse-button"
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
              title={open ? 'Collapse' : 'Expand'}
              onClick={vm.toggleCollapsed}
            >
              <ArrowDownIcon />
            </button>
          )}
        </div>
      </div>
      <div id={bodyId} hidden={!open}>
        {vm.editorProps ? (
          <form className="about-editor" noValidate onSubmit={vm.submit} aria-label={`Edit ${editLabel ?? title}`}>
            {editor(vm.editorProps)}
            {vm.message && (
              <p role="alert" className="form-error">
                {vm.message}
              </p>
            )}
            <div className="about-editor-actions">
              <button type="submit" className="button" disabled={vm.saving}>
                {vm.saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="button button-secondary" disabled={vm.saving} onClick={vm.cancel}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
