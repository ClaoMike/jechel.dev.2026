import { NavLink } from 'react-router'
import { EyeOffIcon } from '../../components/icons/icons'

/**
 * One tab: a link that's marked current on its page (and, when `nested`, the pages under it); the admin sees which
 * visitor pages are hidden, and their own tabs in pink and violet. A `badge` (e.g. BETA) follows the name.
 */
export function TabLink({
  to,
  label,
  hiddenFromVisitors,
  adminOnly = false,
  badge,
  nested = false,
}: {
  to: string
  label: string
  hiddenFromVisitors: boolean
  adminOnly?: boolean
  badge?: string
  nested?: boolean
}) {
  return (
    <NavLink to={to} end={!nested} className={adminOnly ? 'tab tab-admin' : 'tab'} draggable={false} title={hiddenFromVisitors ? 'Hidden from visitors' : undefined}>
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
            <span className="visually-hidden">(hidden from visitors)</span>
          </span>
        </>
      )}
    </NavLink>
  )
}
