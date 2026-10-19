import { useSlowSceneNoticeViewModel } from './SlowSceneNotice.viewModel'

/**
 * Says why the theme just changed when Vice was too slow for the device (themeSlice.reportSlowScene),
 * with a way to keep Vice anyway.
 */
export function SlowSceneNotice() {
  const vm = useSlowSceneNoticeViewModel()

  return (
    <div className="slow-scene-notice" role="status" hidden={!vm.shown}>
      {vm.shown && (
        <>
          <p>Vice was running slowly on this device, so the site switched to {vm.themeName}.</p>
          <div className="slow-scene-actions">
            <button type="button" className="button button-secondary button-small" onClick={vm.keepVice}>
              Use Vice anyway
            </button>
            <button type="button" className="button button-small" onClick={vm.dismiss}>
              OK
            </button>
          </div>
        </>
      )}
    </div>
  )
}
