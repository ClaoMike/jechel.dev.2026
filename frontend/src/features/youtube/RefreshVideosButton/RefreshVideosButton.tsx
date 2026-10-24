import { useId } from 'react'
import { CopyButton } from '../../../components/CopyButton/CopyButton'
import { CheckIcon, CloseIcon, RefreshIcon } from '../../../components/icons/icons'
import { Modal } from '../../../components/Modal/Modal'
import { useRefreshVideosButtonViewModel } from './RefreshVideosButton.viewModel'

/**
 * The admin's refresh, beside "Visit my YouTube page": fetches the videos now (e.g. right after an upload) instead of
 * within the hour. Its icon spins while it asks, then turns into a green tick, or a red cross and a popup with what went
 * wrong (closed only with its ×), to copy and look into.
 */
export function RefreshVideosButton() {
  const vm = useRefreshVideosButtonViewModel()
  const titleId = useId()

  return (
    <>
      <button
        type="button"
        className="icon-button refresh-button"
        data-phase={vm.phase}
        aria-label="Refresh from YouTube"
        title="Refresh from YouTube"
        aria-busy={vm.phase === 'busy'}
        onClick={vm.refresh}
      >
        <span className="refresh-icon refresh-icon-refresh">
          <RefreshIcon size={18} />
        </span>
        <span className="refresh-icon refresh-icon-done">
          <CheckIcon size={18} />
        </span>
        <span className="refresh-icon refresh-icon-failed">
          <CloseIcon size={18} />
        </span>
      </button>
      <span className="visually-hidden refresh-status" role="status">
        {vm.announcement}
      </span>

      {vm.error && (
        <Modal labelledBy={titleId} onClose={vm.closeError} dismissible={false} className="refresh-error">
          <div className="modal-header">
            <h2 id={titleId}>Couldn't refresh from YouTube</h2>
            <button type="button" className="icon-button" onClick={vm.closeError} aria-label="Close">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p>{vm.error.message}</p>
          <div className="error-report">
            <div className="error-report-header">
              <h3>Details</h3>
              <CopyButton value={vm.error.report} label="the error details" />
            </div>
            <pre>{vm.error.report}</pre>
          </div>
        </Modal>
      )}
    </>
  )
}
