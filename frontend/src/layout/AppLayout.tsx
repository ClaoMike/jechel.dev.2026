import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { SignedIn, useAuth } from '../auth'
import { api } from '../services/api'
import { TabNav } from './TabNav'

type Greeting =
  | { status: 'loading' }
  | { status: 'success'; firstName: string }
  | { status: 'error' }

/** The site frame: greeting, the admin's session bar, the tabs, and the current tab's page. */
export function AppLayout() {
  const { signOut } = useAuth()
  const [greeting, setGreeting] = useState<Greeting>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    api.profile
      .getFirstName(controller.signal)
      .then((firstName) => setGreeting({ status: 'success', firstName }))
      .catch(() => {
        if (!controller.signal.aborted) setGreeting({ status: 'error' })
      })

    return () => controller.abort()
  }, [])

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header-top">
          {greeting.status === 'loading' && <p className="greeting-placeholder">Loading…</p>}
          {greeting.status === 'error' && <p role="alert">Something went wrong. Please try again later.</p>}
          {greeting.status === 'success' && <h1>Hi, I'm {greeting.firstName}</h1>}
          <SignedIn>
            {(user) => (
              <div className="session-bar">
                <span>Signed in as {user.email}</span>
                <button type="button" className="button button-secondary" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            )}
          </SignedIn>
        </div>
        <TabNav />
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
