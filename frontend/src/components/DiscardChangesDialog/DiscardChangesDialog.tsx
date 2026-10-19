import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'

/** "Discard your changes?" over a popup with unsaved changes: Discard closes it, Cancel goes back to it. */
export function DiscardChangesDialog({ detail, onDiscard, onClose }: { detail: string; onDiscard: () => void; onClose: () => void }) {
  return (
    <ConfirmDialog title="Discard your changes?" confirmLabel="Discard" onConfirm={onDiscard} onClose={onClose}>
      <p>{detail}</p>
    </ConfirmDialog>
  )
}
