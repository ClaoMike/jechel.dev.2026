import { useCallback, useState } from 'react'
import { useFeature } from '../../features/site/useSite'
import { SupportButton } from '../../features/support/SupportButton/SupportButton'
import { SubscribeButton } from '../../features/updates/SubscribeButton/SubscribeButton'
import { AdminBar } from '../AdminBar/AdminBar'
import { UserBar } from '../UserBar/UserBar'
import { Brand } from '../Brand/Brand'
import { RivieraBackground } from '../background/RivieraBackground/RivieraBackground'
import { ContentToggle } from '../ContentToggle/ContentToggle'
import { PageTransition } from '../PageTransition/PageTransition'
import { SiteFooter } from '../SiteFooter/SiteFooter'
import { SlowSceneNotice } from '../SlowSceneNotice/SlowSceneNotice'
import { SystemNav } from '../SystemNav/SystemNav'
import { MaintenanceScreen } from '../../features/site/MaintenanceScreen/MaintenanceScreen'
import { TabNav } from '../TabNav/TabNav'
import { ThemeSwitch } from '../ThemeSwitch/ThemeSwitch'
import { useAppSelector } from '../../store'
import { activePreview } from '../../store/previewSlice'
import { useScrollMemory } from '../useScrollMemory'
import { useSwipeNavigation } from '../useSwipeNavigation'

/** Shown instead of the tabs and the page while visitors can't use the site (see App). */
export interface Downtime {
  reason: 'maintenance' | 'unreachable'
  message?: string
}

/**
 * The site frame: the admin's own bar on top (who's signed in, Sign out), then the site name, "Buy me a coffee" and
 * "Get updates", the theme switch, the tabs, System's own navigation (on the admin's pages), the current tab's page
 * (on a touchscreen, a swipe sideways goes to the next or previous: useSwipeNavigation), and the footer. With
 * `downtime`, visitors get the same frame (the name, the theme switch, Vice's scene) around the maintenance card,
 * without the tabs, the pages, the footer or the header's other buttons.
 */
export function AppLayout({ downtime }: { downtime?: Downtime } = {}) {
  // The admin's preview (normal / loading / error): changing it remounts what loads data (the keys
  // below), so their own state starts afresh too, as everything loads again (store/listeners).
  const preview = useAppSelector(activePreview)
  const theme = useAppSelector((state) => state.theme.theme)
  useScrollMemory()
  const showUpdates = useFeature('updates')
  const vice = theme === 'vice'
  // Vice can hide the page to show off the scene; leaving Vice always brings the page back.
  const [hideContent, setHideContent] = useState(false)
  if (!vice && hideContent) setHideContent(false)
  const contentHidden = vice && hideContent
  // Swiping between pages, for everyone; not while the page is down or hidden.
  const pageRef = useSwipeNavigation(!downtime && !contentHidden)
  const toggleContent = useCallback(() => setHideContent((hidden) => !hidden), [])
  // On phones, Vice's hide / show button sits in this slot in the header while the page shows (see ContentToggle).
  const [toggleSlot, setToggleSlot] = useState<HTMLSpanElement | null>(null)

  return (
    <div className="app" data-content-hidden={contentHidden || undefined}>
      {vice && <RivieraBackground />}
      <header className="site-header" inert={contentHidden}>
        <AdminBar />
        <UserBar />
        <div className="site-header-top">
          <Brand />
          <div className="header-actions">
            {vice && <span ref={setToggleSlot} className="content-toggle-slot" />}
            {!downtime && <SupportButton key={preview} />}
            {!downtime && showUpdates && <SubscribeButton />}
            <ThemeSwitch />
          </div>
        </div>
        {!downtime && <TabNav />}
      </header>
      <main ref={pageRef} className="page" inert={contentHidden}>
        {downtime ? (
          <MaintenanceScreen reason={downtime.reason} message={downtime.message} />
        ) : (
          <>
            <SystemNav />
            <PageTransition key={preview} />
          </>
        )}
      </main>
      {!downtime && <SiteFooter inert={contentHidden} />}
      {vice && <ContentToggle hidden={contentHidden} onToggle={toggleContent} slot={toggleSlot} />}
      <SlowSceneNotice />
    </div>
  )
}
