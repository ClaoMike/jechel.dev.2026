import { Link } from 'react-router'
import { useSystemNavViewModel } from './SystemNav.viewModel'

/** The admin's pages, under the System tab: a row of pills above the page, which stays while the pages slide. */
export function SystemNav() {
  const vm = useSystemNavViewModel()
  if (!vm.pages) return null

  return (
    <nav className="pill-nav system-nav" aria-label="System">
      <ul>
        {vm.pages.map((page) => (
          <li key={page.to}>
            <Link to={page.to} className="pill-nav-link" aria-current={page.current ? 'page' : undefined}>
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
