import { useRefreshVideosButtonViewModel } from './RefreshVideosButton.viewModel'

/** The admin's "Refresh from YouTube" above the videos: fetches them now (e.g. right after an upload) instead of within the hour. */
export function RefreshVideosButton() {
  const vm = useRefreshVideosButtonViewModel()

  return (
    <div className="page-actions">
      {vm.result && (
        <p role="status" className={vm.result.ok ? 'settings-ok' : 'field-error'}>
          {vm.result.ok ? '✓ ' : ''}
          {vm.result.message}
        </p>
      )}
      <button type="button" className="button button-secondary button-small" disabled={vm.busy} onClick={vm.refresh}>
        {vm.busy ? 'Refreshing…' : 'Refresh from YouTube'}
      </button>
    </div>
  )
}
