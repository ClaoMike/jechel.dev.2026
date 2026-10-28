import { Link } from 'react-router'
import { EyeOffIcon } from '../../components/icons/icons'
import { strings } from '../../strings'

/**
 * One tab: a link marked current (aria-current="page") on its page, the pages under it, or the pages it groups (the tab
 * bar works that out); the admin sees which visitor pages are hidden, and their own tabs in pink and violet. A `badge`
 * (e.g. BETA) follows the name.
 */
export function TabLink({
  to,
  label,
  current,
  hiddenFromVisitors,
  adminOnly = false,
  badge,
}: {
  to: string
  label: string
  current: boolean
  hiddenFromVisitors: boolean
  adminOnly?: boolean
  badge?: string
}) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={adminOnly ? 'tab tab-admin' : 'tab'}
      draggable={false}
      title={hiddenFromVisitors ? strings.tabLink.hiddenVisitors : undefined}
    >
      {label}
      {badge && (
        <>
          {' '}
          <span className="tab-badge">{badge}</span>
        </>
      )}
      {hiddenFromVisitors && (
        <>
          {' '}
          <span className="tab-hidden">
            <EyeOffIcon size={14} />
            <span className="visually-hidden">{strings.tabLink.hiddenVisitors2}</span>
          </span>
        </>
      )}
    </Link>
  )
}
