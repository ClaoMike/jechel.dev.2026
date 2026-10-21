import { DiscardChangesDialog } from '../../../components/DiscardChangesDialog/DiscardChangesDialog'
import { AddButton } from '../../../components/fields'
import { Modal } from '../../../components/Modal/Modal'
import { CategoryRow } from '../CategoryRow/CategoryRow'
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
      <form className="app-form" noValidate onSubmit={vm.submit}>
        <p className="muted editor-note">Apps show their categories as labels, in this order. Removing one takes it off every app.</p>
        <ol className="category-list">
          {vm.rows.map(({ key, ...row }) => (
            <CategoryRow key={key} {...row} />
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
            {vm.saveLabel}
          </button>
        </div>
      </form>
      {vm.askDiscard && <DiscardChangesDialog detail="Your changes to the categories aren't saved." onDiscard={props.onClose} onClose={vm.stopAskingDiscard} />}
    </Modal>
  )
}
