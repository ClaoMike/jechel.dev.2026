import { useEffect } from 'react'

export const SITE_MANIFEST = '/manifest.webmanifest'
/** Opens on /admin: the sign-in, or home when the admin is signed in already. */
export const ADMIN_MANIFEST = '/admin.webmanifest'

/**
 * Which web app "Add to Home Screen" saves. A phone saves the manifest's start page, not the page on show,
 * so the admin's sign-in (and the admin, signed in) links the admin's own: from the Home Screen it then
 * opens on /admin, a separate app from the visitors' one.
 */
export function useAppManifest(admin: boolean) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (link) link.setAttribute('href', admin ? ADMIN_MANIFEST : SITE_MANIFEST)
  }, [admin])
}
