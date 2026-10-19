import { Link } from 'react-router'
import { SignedIn } from '../../auth'
import { PreviewSwitch } from '../../features/preview/PreviewSwitch/PreviewSwitch'
import { SupportButton } from '../../features/support/SupportButton/SupportButton'
import { SubscribeButton } from '../../features/updates/SubscribeButton/SubscribeButton'
import { useAppLayoutViewModel } from './AppLayout.viewModel'
import { RivieraBackground } from '../background/RivieraBackground/RivieraBackground'
import { ContentToggle } from '../ContentToggle/ContentToggle'
import { PageTransition } from '../PageTransition/PageTransition'
import { SiteFooter } from '../SiteFooter/SiteFooter'
import { SlowSceneNotice } from '../SlowSceneNotice/SlowSceneNotice'
import { MaintenanceScreen } from '../../features/site/MaintenanceScreen/MaintenanceScreen'
import { TabNav } from '../TabNav/TabNav'
import { ThemeSwitch } from '../ThemeSwitch/ThemeSwitch'

/** Shown instead of the tabs and the page while visitors can't use the site (see App). */
export interface Downtime {
  reason: 'maintenance' | 'unreachable'
  message?: string
}

/**
 * The site frame: the admin's own bar on top (who's signed in, Sign out), then the site name, "Buy me a
 * coffee" and "Get updates", the theme switch, the tabs, the current tab's page, and the footer. With
 * `downtime`, visitors get the same frame (the name, the theme switch, Vice's scene) around the
 * maintenance card, without the tabs, the pages, the footer or the header's other buttons.
 */
export function AppLayout({ downtime }: { downtime?: Downtime } = {}) {
  const { toggleSlotRef, ...vm } = useAppLayoutViewModel()

  return (
    <div className="app" data-content-hidden={vm.contentHidden || undefined}>
      {vm.vice && <RivieraBackground />}
      <header className="site-header" inert={vm.contentHidden}>
        <SignedIn>
          {(user) => (
            <div className="admin-bar">
              <div className="admin-bar-inner">
                <span className="admin-bar-badge">Admin</span>
                {vm.maintenance && (
                  <Link to="/settings" className="admin-bar-maintenance">
                    Maintenance on: visitors see the maintenance page
                  </Link>
                )}
                {vm.showPreviewSwitch && <PreviewSwitch />}
                <span className="admin-bar-user">Signed in as {user.email}</span>
                <button type="button" className="button button-secondary button-small" onClick={vm.signOut}>
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
            {vm.vice && <span ref={toggleSlotRef} className="content-toggle-slot" aria-hidden="true" />}
            {!downtime && <SupportButton key={vm.preview} />}
            {!downtime && vm.showUpdates && <SubscribeButton />}
            <ThemeSwitch />
          </div>
        </div>
        {!downtime && <TabNav />}
      </header>
      <main className="page" inert={vm.contentHidden}>
        {downtime ? <MaintenanceScreen reason={downtime.reason} message={downtime.message} /> : <PageTransition key={vm.preview} />}
      </main>
      {!downtime && <SiteFooter inert={vm.contentHidden} />}
      {vm.vice && <ContentToggle hidden={vm.contentHidden} onToggle={vm.toggleContent} anchor={toggleSlotRef} />}
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
