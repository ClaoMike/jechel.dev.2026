import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import { Modal } from '../../../components/Modal/Modal'
import { AddButton, ItemControls, TextField } from '../../about/fields/fields'
import { useCategoriesDialogViewModel, type CategoriesDialogProps } from './CategoriesDialog.viewModel'

/**
 * The admin's list of app categories: rename, reorder (apps show their labels in this order),
 * add and remove them. Saved together; removing one takes it off every app.
 */
export function CategoriesDialog(props: CategoriesDialogProps) {
  const vm = useCategoriesDialogViewModel(props)

  return (
    <Modal labelledBy={vm.titleId} onClose={vm.requestClose}>
      <div className="modal-header">
        <h2 id={vm.titleId}>App categories</h2>
        <button type="button" className="icon-button" onClick={vm.requestClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <form
        className="app-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          vm.save()
        }}
      >
        <p className="muted editor-note">Apps show their categories as labels, in this order. Removing one takes it off every app.</p>
        <ol className="category-list">
          {vm.draft.map((category, i) => (
            <li key={category.id ?? `new-${i}`} className="category-row">
              <TextField label={`Category ${i + 1}`} value={category.name} onChange={(name) => vm.rename(i, name)} error={vm.errors[`[${i}].name`] ?? vm.errors[`[${i}].id`]} />
              <ItemControls name={category.name.trim() || `category ${i + 1}`} index={i} count={vm.draft.length} onMove={vm.move} onRemove={() => vm.remove(i)} />
            </li>
          ))}
        </ol>
        <AddButton onClick={vm.add}>Add category</AddButton>
        {vm.message && (
          <p className="field-error" role="alert">
            {vm.message}
          </p>
        )}
        <div className="app-form-actions">
          <button type="button" className="button button-secondary" onClick={props.onClose} disabled={vm.saving}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={vm.saving}>
            {vm.saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      {vm.askDiscard && (
        <ConfirmDialog title="Discard your changes?" confirmLabel="Discard" onConfirm={props.onClose} onClose={vm.stopAskingDiscard}>
          <p>Your changes to the categories aren't saved.</p>
        </ConfirmDialog>
      )}
    </Modal>
  )
}
