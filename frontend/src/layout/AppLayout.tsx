import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router'
import { SignedIn, useAuth } from '../auth'
import { applyPreview, usePreviewMode } from '../features/preview/preview'
import { PreviewSwitch } from '../features/preview/PreviewSwitch'
import { SupportButton } from '../features/support/SupportButton'
import { SubscribeButton } from '../features/updates/SubscribeButton'
import { RivieraBackground } from './background/RivieraBackground'
import { ContentToggle } from './ContentToggle'
import { PageTransition } from './PageTransition'
import { SiteFooter } from './SiteFooter'
import { SlowSceneNotice } from './SlowSceneNotice'
import { useScrollMemory } from './useScrollMemory'
import { TabNav } from './TabNav'
import { ThemeSwitch } from './ThemeSwitch'
import { useTheme } from './theme'

/** The site frame: the admin's own bar on top (who's signed in, Sign out), then the site name, "Buy me a coffee" and "Get updates", the theme switch, the tabs, the current tab's page, and the footer. */
export function AppLayout() {
  const { signOut, isAuthenticated } = useAuth()
  // The admin's preview (normal / loading / error) applies to requests before anything below renders
  // and fetches; changing it remounts what loads data (the keys below), so everything loads again.
  const previewMode = usePreviewMode()
  const preview = isAuthenticated ? previewMode : 'normal'
  applyPreview(preview)
  const theme = useTheme()
  useScrollMemory()
  // Vice can hide the page to show off the scene; leaving Vice always brings the page back.
  const [hideContent, setHideContent] = useState(false)
  const contentHidden = theme === 'vice' && hideContent
  if (theme !== 'vice' && hideContent) setHideContent(false)
  const toggleContent = useCallback(() => setHideContent((hidden) => !hidden), [])
  // On phones, Vice's hide / show button sits here (pinned over this slot; see ContentToggle).
  const toggleSlot = useRef<HTMLSpanElement>(null)

  return (
    <div className="app" data-content-hidden={contentHidden || undefined}>
      {theme === 'vice' && <RivieraBackground />}
      <header className="site-header" inert={contentHidden}>
        <SignedIn>
          {(user) => (
            <div className="admin-bar">
              <div className="admin-bar-inner">
                <span className="admin-bar-badge">Admin</span>
                <PreviewSwitch />
                <span className="admin-bar-user">Signed in as {user.email}</span>
                <button type="button" className="button button-secondary button-small" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </SignedIn>
        <div className="site-header-top">
          <h1 className="brand">
            {/* In Vice it's written in neon (glass.css): a still shadow layer under the moving colours, and a drawn j (BrandJ). */}
            {/* Screen readers get the name once, as plain text; the drawn layers are decoration (and would read "j echel.dev"). */}
            <Link to="/" className="brand-link">
              <span className="visually-hidden">jechel.dev</span>
              <span className="brand-text" aria-hidden="true">
                <span className="brand-shadow">
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
            {theme === 'vice' && <span ref={toggleSlot} className="content-toggle-slot" aria-hidden="true" />}
            <SupportButton key={preview} />
            <SubscribeButton />
            <ThemeSwitch />
          </div>
        </div>
        <TabNav />
      </header>
      <main className="page" inert={contentHidden}>
        <PageTransition key={preview} />
      </main>
      <SiteFooter inert={contentHidden} />
      {theme === 'vice' && <ContentToggle hidden={contentHidden} onToggle={toggleContent} anchor={toggleSlot} />}
      <SlowSceneNotice />
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
