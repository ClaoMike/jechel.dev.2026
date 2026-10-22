import { SupportButton } from '../../features/support/SupportButton/SupportButton'
import { SubscribeButton } from '../../features/updates/SubscribeButton/SubscribeButton'
import { AdminBar } from '../AdminBar/AdminBar'
import { UserBar } from '../UserBar/UserBar'
import { Brand } from '../Brand/Brand'
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
        <AdminBar />
        <UserBar />
        <div className="site-header-top">
          <Brand />
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
