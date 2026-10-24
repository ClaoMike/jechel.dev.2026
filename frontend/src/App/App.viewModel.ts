import { useLocation } from 'react-router'
import { useSessionKeeper } from '../auth'
import { useLoadSite } from '../features/site/useSite'
import { useAppManifest } from '../layout/manifest'
import type { Downtime } from '../layout/AppLayout/AppLayout'
import { useAppSelector } from '../store'

/** Pages that work during maintenance too. */
const ALWAYS_OPEN = ['/admin', '/updates/confirm', '/updates/unsubscribe']

/**
 * Keeps the session and what visitors may see up to date, and decides whether visitors get the site
 * or the maintenance screen: when it's on, or when the API can't be reached. The admin always gets
 * the site; signing in (/admin) and the links in emails (confirm, unsubscribe) always work. The sign-in and
 * the admin get the admin's own web app for the Home Screen.
 */
export function useAppViewModel(): { downtime: Downtime | null } {
  useSessionKeeper()
  useLoadSite()
  const site = useAppSelector((state) => state.site)
  const auth = useAppSelector((state) => state.auth.status)
  // "/admin/" is "/admin" too.
  const path = useLocation().pathname.replace(/\/+$/, '') || '/'
  useAppManifest(path === '/admin' || auth === 'authenticated')

  if (auth !== 'authenticated' && !ALWAYS_OPEN.includes(path)) {
    if (site.status === 'unreachable') return { downtime: { reason: 'unreachable' } }
    if (site.status === 'loaded' && site.site.maintenance && auth === 'anonymous') return { downtime: { reason: 'maintenance', message: site.site.maintenanceMessage } }
  }
  return { downtime: null }
}
