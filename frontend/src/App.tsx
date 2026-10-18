import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth'
import { AnalyticsTracker } from './features/analytics'
import { MaintenanceScreen, ComingSoonPage } from './features/site/MaintenanceScreen'
import { useLoadSite } from './features/site/useSite'
import { VisiblePage } from './features/site/VisiblePage'
import { TermsProvider } from './features/terms'
import { useAppSelector } from './store'
import { AppLayout } from './layout/AppLayout'
import { AppsPage } from './pages/AppsPage'
import { AboutPage } from './pages/AboutPage'
import { AdminPage } from './pages/AdminPage'
import { CommunityPage } from './pages/CommunityPage'
import { ContactPage } from './pages/ContactPage'
import { EngagementPage } from './pages/EngagementPage'
import { SettingsPage } from './pages/SettingsPage'
import { TermsPage } from './pages/TermsPage'
import { ConfirmSubscriptionPage, UnsubscribePage } from './pages/UpdatesPages'
import { WhatsNewPage } from './pages/WhatsNewPage'
import { YouTubePage } from './pages/YouTubePage'

/** Pages that work during maintenance too. */
const ALWAYS_OPEN = ['/admin', '/updates/confirm', '/updates/unsubscribe']

function App() {
  useLoadSite()
  const site = useAppSelector((state) => state.site)
  const { status: auth } = useAuth()
  const { pathname } = useLocation()

  // Visitors get the maintenance screen when it's on, or when the API can't be reached. The admin
  // always gets the site; signing in (/admin) and the links in emails (confirm, unsubscribe) always work.
  if (auth !== 'authenticated' && !ALWAYS_OPEN.includes(pathname)) {
    if (site.status === 'unreachable') return <MaintenanceScreen reason="unreachable" />
    if (site.status === 'loaded' && site.site.maintenance && auth === 'anonymous') return <MaintenanceScreen reason="maintenance" message={site.site.maintenanceMessage} />
  }

  return (
    <TermsProvider>
      <AnalyticsTracker />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<VisiblePage page="whatsNew"><WhatsNewPage /></VisiblePage>} />
          <Route path="apps" element={<VisiblePage page="apps"><AppsPage /></VisiblePage>} />
          <Route path="youtube" element={<VisiblePage page="youtube"><YouTubePage /></VisiblePage>} />
          <Route path="about" element={<VisiblePage page="about"><AboutPage /></VisiblePage>} />
          <Route path="contact" element={<VisiblePage page="contact"><ContactPage /></VisiblePage>} />
          <Route path="coming-soon" element={<ComingSoonPage />} />
          <Route path="engagement" element={<EngagementPage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="updates/confirm" element={<ConfirmSubscriptionPage />} />
          <Route path="updates/unsubscribe" element={<UnsubscribePage />} />
        </Route>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TermsProvider>
  )
}

export default App
