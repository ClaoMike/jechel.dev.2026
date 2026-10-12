import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { SignedIn, useAuth } from '../auth'
import { RivieraBackground } from './background/RivieraBackground'
import { ContentToggle } from './ContentToggle'
import { PageTransition } from './PageTransition'
import { SiteFooter } from './SiteFooter'
import { TabNav } from './TabNav'
import { ThemeSwitch } from './ThemeSwitch'
import { useTheme } from './theme'

/** The site frame: the site name, the admin's session bar, the theme switch, the tabs, the current tab's page, and the footer. */
export function AppLayout() {
  const { signOut } = useAuth()
  const theme = useTheme()
  // Vice can hide the page to show off the scene; leaving Vice always brings the page back.
  const [hideContent, setHideContent] = useState(false)
  const contentHidden = theme === 'vice' && hideContent
  if (theme !== 'vice' && hideContent) setHideContent(false)
  const toggleContent = useCallback(() => setHideContent((hidden) => !hidden), [])

  return (
    <div className="app" data-content-hidden={contentHidden || undefined}>
      {theme === 'vice' && <RivieraBackground />}
      <header className="site-header" inert={contentHidden}>
        <div className="site-header-top">
          <h1 className="brand">
            {/* In Vice it's written in neon (glass.css): a still shadow layer under the moving colours, and a drawn j (BrandJ). */}
            {/* Named outright: in Vice the drawn j is its own box, which screen readers would read apart ("j echel.dev"). */}
            <Link to="/" className="brand-link" aria-label="jechel.dev">
              <span className="brand-text">
                <span className="brand-shadow" aria-hidden="true">
                  <BrandJ />
                  echel<span className="brand-dot">.</span>dev
                </span>
                <span className="brand-fill">
                  <BrandJ />
                  echel<span className="brand-dot">.</span>dev
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
      <SiteFooter inert={contentHidden} />
      {theme === 'vice' && <ContentToggle hidden={contentHidden} onToggle={toggleContent} />}
    </div>
  )
}

/**
 * The title's "j". In Vice, glass.css draws it (scripts/build_brand_j.py: Mr Dafoe's own j closes its
 * loop up) and shrinks the letter to nothing; the letter stays, so the heading still reads "jechel.dev".
 */
function BrandJ() {
  return (
    <span className="brand-j">
      <span className="brand-j-letter">j</span>
    </span>
  )
}
