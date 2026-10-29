import { ConfirmDialog } from '../ConfirmDialog'
import { strings } from '../../i18n'

/** "Discard your changes?" over a popup with unsaved changes: Discard closes it, Cancel goes back to it. */
export function DiscardChangesDialog({ detail, onDiscard, onClose }: { detail: string; onDiscard: () => void; onClose: () => void }) {
  return (
    <ConfirmDialog title={strings.discardChangesDialog.discardChanges} confirmLabel={strings.discardChangesDialog.discard} onConfirm={onDiscard} onClose={onClose}>
      <p>{detail}</p>
    </ConfirmDialog>
  )
}
