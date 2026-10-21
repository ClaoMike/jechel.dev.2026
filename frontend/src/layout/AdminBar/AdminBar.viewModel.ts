import { useAuth } from '../../auth'
import { useAppSelector } from '../../store'
import { PREVIEW_AVAILABLE } from '../../store/previewSlice'

/** Only for the signed-in admin: who's signed in, whether maintenance is on, the preview switch (in development), and signing out. */
export function useAdminBarViewModel() {
  const { user, signOut } = useAuth()
  const maintenance = useAppSelector((state) => state.site.status === 'loaded' && state.site.site.maintenance)
  return {
    shown: user !== null,
    signedInAs: user ? `Signed in as ${user.email}` : '',
    maintenance: maintenance ? 'Maintenance on: visitors see the maintenance page' : null,
    showPreviewSwitch: PREVIEW_AVAILABLE,
    signOut: () => void signOut(),
  }
}
