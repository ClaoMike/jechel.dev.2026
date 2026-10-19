import { DiscardChangesDialog } from '../../../components/DiscardChangesDialog/DiscardChangesDialog'
import { PencilIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import { AppDetailsView } from '../AppDetailsView/AppDetailsView'
import { AppDialogHeader } from '../AppDialogHeader/AppDialogHeader'
import { AppForm } from '../AppForm/AppForm'
import { useAppDialogViewModel, type AppDialogProps } from './AppDialog.viewModel'

/**
 * An app's details: its images and videos in a slider, title and description. The admin can
 * edit it in the same popup, and a new app opens straight in the form.
 */
export function AppDialog(props: AppDialogProps) {
  const vm = useAppDialogViewModel(props)

  return (
    <Modal labelledBy={vm.titleId} onClose={vm.requestClose} className="modal-wide">
      <AppDialogHeader {...vm.header} />
      {vm.shown && (
        <AppDetailsView app={vm.shown}>
          {vm.canEdit && (
            <div className="app-actions">
              <button type="button" className="button button-secondary button-small" onClick={vm.edit}>
                <PencilIcon size={16} />
                Edit
              </button>
            </div>
          )}
        </AppDetailsView>
      )}
      {vm.form && <AppForm {...vm.form} />}
      {vm.askDiscard && <DiscardChangesDialog detail="What you changed in this app isn't saved." onDiscard={props.onClose} onClose={vm.stopAskingDiscard} />}
    </Modal>
  )
}
