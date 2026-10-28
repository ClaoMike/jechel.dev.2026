import { Link, useLocation } from 'react-router'
import { useAuth } from '../../auth'
import { isCurrent, SYSTEM_PAGES } from '../tabs'
import { strings } from '../../strings'

/**
 * The admin's pages, under the System tab: a row of pills above the page, which stays while the pages slide. For the
 * signed-in admin on one of them; nothing elsewhere (the terms page, for visitors, too).
 */
export function SystemNav() {
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  if (!isAuthenticated || !SYSTEM_PAGES.some((page) => isCurrent(page, pathname))) return null

  return (
    <nav className="pill-nav system-nav" aria-label={strings.systemNav.system}>
      <ul>
        {SYSTEM_PAGES.map((page) => (
          <li key={page.to}>
            <Link to={page.to} className="pill-nav-link" aria-current={isCurrent(page, pathname) ? 'page' : undefined}>
              {page.label}
              {page.badge && (
                <>
                  {' '}
                  <span className="pill-nav-badge">{page.badge}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
