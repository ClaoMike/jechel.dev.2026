import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { PencilIcon, TrashIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import { TextField } from '../../about/fields/fields'
import { CategoryLabels, CategoryPicker, LinksEditor, PlatformsEditor } from '../AppFields/AppFields'
import { useAppDialogViewModel, type AppDialogProps } from './AppDialog.viewModel'
import { AppDetailsView } from '../AppDetailsView/AppDetailsView'
import { MediaListEditor } from '../MediaListEditor/MediaListEditor'

/**
 * An app's details: its images and videos in a slider, title and description. The admin can
 * edit it in the same popup, and a new app opens straight in the form.
 */
export function AppDialog(props: AppDialogProps) {
  const { app, categories, canEdit, onClose } = props
  const vm = useAppDialogViewModel(props)
  const { draft, errors } = vm

  return (
    <Modal labelledBy={vm.titleId} onClose={vm.requestClose} className="modal-wide">
      <div className="modal-header">
        <div className="app-heading">
          <h2 id={vm.titleId}>{vm.heading}</h2>
          {draft === null && app && <CategoryLabels categories={app.categories} />}
        </div>
        <button type="button" className="icon-button" onClick={vm.requestClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {draft === null && app && (
        <AppDetailsView app={app}>
          {canEdit && (
            <div className="app-actions">
              <button type="button" className="button button-secondary button-small" onClick={vm.edit}>
                <PencilIcon size={16} />
                Edit
              </button>
            </div>
          )}
        </AppDetailsView>
      )}

      {draft !== null && (
        <form
          className="app-form"
          // The API's messages show under the fields, as everywhere else on the site.
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            vm.save()
          }}
        >
          <TextField label="Title" value={draft.title} required onChange={(title) => vm.change({ title })} error={errors.title} />
          <CategoryPicker categories={categories} value={draft.categoryIds} onChange={(categoryIds) => vm.change({ categoryIds })} error={errors.categoryIds} />
          <TextField label="Description" multiline allowLinks value={draft.description} onChange={(description) => vm.change({ description })} error={errors.description} />
          <PlatformsEditor value={draft.platforms} onChange={(platforms) => vm.change({ platforms })} error={errors.platforms} />
          <LinksEditor value={draft.links} onChange={(links) => vm.change({ links })} errors={errors} />
          <MediaListEditor value={draft.media} update={vm.updateMedia} error={vm.mediaError} />
          {vm.message && (
            <p className="field-error" role="alert">
              {vm.message}
            </p>
          )}
          <div className="app-form-actions">
            {app && (
              <DeleteButton
                what={app.title}
                detail="It's removed from the Apps page, with its images and videos. This can't be undone."
                onDelete={vm.remove}
                className="button button-secondary button-small app-delete"
                label="Delete app"
              >
                <TrashIcon size={16} />
                Delete app
              </DeleteButton>
            )}
            <button type="button" className="button button-secondary" onClick={vm.stopEditing} disabled={vm.saving}>
              Cancel
            </button>
            <button type="submit" className="button" disabled={vm.saving}>
              {vm.saving ? 'Saving…' : vm.isNew ? 'Add app' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {vm.askDiscard && (
        <ConfirmDialog title="Discard your changes?" confirmLabel="Discard" onConfirm={onClose} onClose={vm.stopAskingDiscard}>
          <p>What you changed in this app isn't saved.</p>
        </ConfirmDialog>
      )}
    </Modal>
  )
}
