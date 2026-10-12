import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useAuth } from '../auth'
import { TABS } from './tabs'

/** Links styled as tabs; the current one gets aria-current="page" (from NavLink). Admin-only tabs show once signed in. */
export function TabNav() {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const { isAuthenticated } = useAuth()

  // On narrow screens the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  return (
    <nav ref={navRef} className="tabs" aria-label="Sections">
      {TABS.filter((tab) => isAuthenticated || !tab.adminOnly).map((tab) => (
        <NavLink key={tab.to} to={tab.to} end className="tab">
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
