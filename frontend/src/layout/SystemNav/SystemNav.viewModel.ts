import { useLocation } from 'react-router'
import { useAuth } from '../../auth'
import { isCurrent, SYSTEM_PAGES } from '../tabs'

/** System's pages, for the signed-in admin on one of them; nothing elsewhere (the terms page, for visitors, too). */
export function useSystemNavViewModel() {
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  const shown = isAuthenticated && SYSTEM_PAGES.some((page) => isCurrent(page, pathname))
  return { pages: shown ? SYSTEM_PAGES.map((page) => ({ ...page, current: isCurrent(page, pathname) })) : null }
}
