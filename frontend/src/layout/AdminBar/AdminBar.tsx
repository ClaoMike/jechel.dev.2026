import { Link } from 'react-router'
import { PreviewSwitch } from '../../features/preview/PreviewSwitch/PreviewSwitch'
import { useAdminBarViewModel } from './AdminBar.viewModel'

/** The admin's own bar above the header: "Admin", a maintenance warning, the preview switch (in development), who's signed in, Sign out. */
export function AdminBar() {
  const vm = useAdminBarViewModel()
  if (!vm.shown) return null
  return (
    <div className="admin-bar">
      <div className="admin-bar-inner">
        <span className="admin-bar-badge">Admin</span>
        {vm.maintenance && (
          <Link to="/settings" className="admin-bar-maintenance">
            {vm.maintenance}
          </Link>
        )}
        {vm.showPreviewSwitch && <PreviewSwitch />}
        <span className="admin-bar-user">{vm.signedInAs}</span>
        <button type="button" className="button button-secondary button-small" onClick={vm.signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
