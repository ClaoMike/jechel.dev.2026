import { useUserBarViewModel } from './UserBar.viewModel'

/** The visitor's bar above the header, when running locally only: "User", and resetting the terms' acceptance (to see the welcome popup again). */
export function UserBar() {
  const vm = useUserBarViewModel()
  if (!vm.shown) return null
  return (
    <div className="admin-bar user-bar" role="region" aria-label="Development tools">
      <div className="admin-bar-inner">
        <span className="admin-bar-badge">User</span>
        <button type="button" className="button button-secondary button-small" onClick={vm.resetTerms}>
          Reset terms acceptance
        </button>
      </div>
    </div>
  )
}
