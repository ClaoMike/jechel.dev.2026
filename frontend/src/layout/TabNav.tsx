import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'

/** The site's sections, in tab order. Each is a route rendered inside <AppLayout>. */
const TABS = [
  { to: '/', label: "What's new?" },
  { to: '/apps', label: 'Apps' },
  { to: '/youtube', label: 'YouTube' },
  { to: '/about', label: 'About Me' },
  { to: '/contact', label: 'Contact' },
] as const

/** Links styled as tabs; the current one gets aria-current="page" (from NavLink). */
export function TabNav() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // On narrow screens the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <nav ref={navRef} className="tabs" aria-label="Sections">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end className="tab">
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
