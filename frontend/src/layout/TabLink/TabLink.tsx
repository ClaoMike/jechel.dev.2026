import { NavLink } from 'react-router'
import { EyeOffIcon } from '../../components/icons/icons'

/** One tab: a link that's marked current on its page; the admin sees which visitor pages are hidden. */
export function TabLink({ to, label, hiddenFromVisitors }: { to: string; label: string; hiddenFromVisitors: boolean }) {
  return (
    <NavLink to={to} end className="tab" draggable={false} title={hiddenFromVisitors ? 'Hidden from visitors' : undefined}>
      {label}
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
