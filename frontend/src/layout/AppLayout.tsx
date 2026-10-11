import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { SignedIn, useAuth } from '../auth'
import { RivieraBackground } from './background/RivieraBackground'
import { ContentToggle } from './ContentToggle'
import { PageTransition } from './PageTransition'
import { TabNav } from './TabNav'
import { ThemeSwitch } from './ThemeSwitch'
import { useTheme } from './theme'

/** The site frame: the site name, the admin's session bar, the theme switch, the tabs, and the current tab's page. */
export function AppLayout() {
  const { signOut } = useAuth()
  const theme = useTheme()
  // R* can hide the page to show off the scene; leaving R* always brings the page back.
  const [hideContent, setHideContent] = useState(false)
  const contentHidden = theme === 'rstar' && hideContent
  if (theme !== 'rstar' && hideContent) setHideContent(false)
  const toggleContent = useCallback(() => setHideContent((hidden) => !hidden), [])

  return (
    <div className="app" data-content-hidden={contentHidden || undefined}>
      {theme === 'rstar' && <RivieraBackground />}
      <header className="site-header" inert={contentHidden}>
        <div className="site-header-top">
          <h1 className="brand">
            {/* In R* it's written in neon (glass.css): a still shadow layer under the moving colours. */}
            <Link to="/" className="brand-link">
              <span className="brand-text">
                <span className="brand-shadow" aria-hidden="true">
                  jechel<span className="brand-dot">.</span>dev
                </span>
                <span className="brand-fill">
                  jechel<span className="brand-dot">.</span>dev
                </span>
              </span>
            </Link>
          </h1>
          <div className="header-actions">
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
            <ThemeSwitch />
          </div>
        </div>
        <TabNav />
      </header>
      <main className="page" inert={contentHidden}>
        <PageTransition />
      </main>
      {theme === 'rstar' && <ContentToggle hidden={contentHidden} onToggle={toggleContent} />}
    </div>
  )
}
