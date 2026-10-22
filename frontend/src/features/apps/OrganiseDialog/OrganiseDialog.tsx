import { DiscardChangesDialog } from '../../../components/DiscardChangesDialog/DiscardChangesDialog'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { GripIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import { OnOffSwitch } from '../../../components/OnOffSwitch/OnOffSwitch'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { useOrganiseDialogViewModel, type OrganiseDialogProps } from './OrganiseDialog.viewModel'

/**
 * The admin's order of the apps: drag them (or use the arrow keys on a handle) into the order the Apps page
 * shows, and choose which What's new? may show (it shows the first one in the order that's on). Save, top left,
 * once something changed. Only × closes it, asking first if there are changes not saved.
 */
export function OrganiseDialog(props: OrganiseDialogProps) {
  const vm = useOrganiseDialogViewModel(props)
  const { sort } = vm

  return (
    <Modal labelledBy={vm.titleId} onClose={vm.requestClose} dismissible={false} className="organise-dialog">
      <div className="modal-header organise-header">
        <button type="button" className="button button-small" onClick={vm.save} disabled={!vm.canSave}>
          {vm.saveLabel}
        </button>
        <h2 id={vm.titleId}>Organise apps</h2>
        <button type="button" className="icon-button" onClick={vm.requestClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p className="muted editor-note">The Apps page shows them in this order. What's new? shows the first one that's on.</p>
      {vm.status === 'loading' && (
        <Loading label="Loading the apps…">
          {[48, 36, 56].map((width, i) => (
            <div key={i} className="organise-row">
              <Skeleton width={`${width}%`} height={16} />
              <Skeleton width={96} height={36} radius={999} />
            </div>
          ))}
        </Loading>
      )}
      {vm.status === 'error' && <ErrorState message="The apps can't be loaded right now." onRetry={vm.retry} />}
      {vm.empty && <p className="muted">No apps yet.</p>}
      {vm.rows.length > 0 && (
        <>
          <p className="organise-columns muted" aria-hidden="true">
            In What's new?
          </p>
          <ol className={sort.dragging ? 'organise-list organise-list-dragging' : 'organise-list'} aria-label="Apps, in order">
            {vm.rows.map((row) => (
              <li key={row.id} className="organise-row" {...sort.itemProps(row.position)}>
                <button type="button" className="icon-button organise-handle" {...sort.handleProps(row.position, row.title)}>
                  <GripIcon size={16} />
                </button>
                <span className="organise-number muted" aria-hidden="true">
                  {row.position + 1}
                </span>
                <span className="organise-title">{row.title}</span>
                <OnOffSwitch label={`Show ${row.title} in What's new?`} on={row.showInWhatsNew} onChange={row.setShowInWhatsNew} disabled={vm.saving} />
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="visually-hidden" aria-live="polite">
        {sort.announcement}
      </p>
      {vm.message && (
        <p className="field-error" role="alert">
          {vm.message}
        </p>
      )}
      <p className="visually-hidden" role="status">
        {vm.savedNote}
      </p>
      {vm.askDiscard && <DiscardChangesDialog detail="Your new order of the apps isn't saved." onDiscard={props.onClose} onClose={vm.stopAskingDiscard} />}
    </Modal>
  )
}
