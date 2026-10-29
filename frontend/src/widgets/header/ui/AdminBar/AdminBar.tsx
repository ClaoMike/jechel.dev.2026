import { Link } from 'react-router'
import { PreviewSwitch } from '@/features/preview'
import { useAuth } from '@/entities/session'
import { useAppSelector } from '@/shared/lib/store'
import { PREVIEW_AVAILABLE } from '@/features/preview'
import { strings } from '@/shared/i18n'

/** The admin's own bar above the header: "Admin", a maintenance warning, the preview switch (in development), who's signed in, Sign out. */
export function AdminBar() {
  const { user, signOut } = useAuth()
  const maintenance = useAppSelector((state) => state.site.status === 'loaded' && state.site.site.maintenance)
  if (!user) return null
  return (
    <div className="admin-bar">
      <div className="admin-bar-inner">
        <span className="admin-bar-badge">{strings.adminBar.admin}</span>
        {maintenance && (
          <Link to="/settings" className="admin-bar-maintenance">
            {strings.adminBar.maintenanceVisitorsSeeMaintenance}
          </Link>
        )}
        {PREVIEW_AVAILABLE && <PreviewSwitch />}
        <span className="admin-bar-user">
          {strings.adminBar.signed}
          {user.email}
        </span>
        <button type="button" className="button button-secondary button-small" onClick={() => void signOut()}>
          {strings.adminBar.signOut}
        </button>
      </div>
    </div>
  )
}
