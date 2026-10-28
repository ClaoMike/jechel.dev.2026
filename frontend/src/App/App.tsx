import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useSessionKeeper } from '../auth'
import { AnalyticsTracker } from '../features/analytics'
import { useLoadSite } from '../features/site/useSite'
import { ComingSoonPage } from '../features/site/ComingSoonPage/ComingSoonPage'
import { VisiblePage } from '../features/site/VisiblePage/VisiblePage'
import { TermsHost } from '../features/terms'
import { AppLayout, type Downtime } from '../layout/AppLayout/AppLayout'
import { useAppManifest } from '../layout/manifest'
import { AppsPage } from '../pages/AppsPage/AppsPage'
import { AboutPage } from '../pages/AboutPage/AboutPage'
import { AdminPage } from '../pages/AdminPage/AdminPage'
import { CommunityPage } from '../pages/CommunityPage/CommunityPage'
import { ContactPage } from '../pages/ContactPage/ContactPage'
import { EngagementPage } from '../pages/EngagementPage/EngagementPage'
import { NotificationsPage } from '../pages/NotificationsPage/NotificationsPage'
import { FeatureTestingPage } from '../pages/FeatureTestingPage/FeatureTestingPage'
import { SettingsPage } from '../pages/SettingsPage/SettingsPage'
import { TermsPage } from '../pages/TermsPage/TermsPage'
import { ConfirmSubscriptionPage } from '../pages/ConfirmSubscriptionPage/ConfirmSubscriptionPage'
import { UnsubscribePage } from '../pages/UnsubscribePage/UnsubscribePage'
import { WhatsNewPage } from '../pages/WhatsNewPage/WhatsNewPage'
import { YouTubePage } from '../pages/YouTubePage/YouTubePage'
import { useAppSelector } from '../store'

/** Pages that work during maintenance too. */
const ALWAYS_OPEN = ['/admin', '/updates/confirm', '/updates/unsubscribe']

/**
 * Keeps the session and what visitors may see up to date, and decides whether visitors get the site
 * or the maintenance screen: when it's on, or when the API can't be reached. The admin always gets
 * the site; signing in (/admin) and the links in emails (confirm, unsubscribe) always work. The sign-in and
 * the admin get the admin's own web app for the Home Screen.
 */
function App() {
  useSessionKeeper()
  useLoadSite()
  const site = useAppSelector((state) => state.site)
  const auth = useAppSelector((state) => state.auth.status)
  // "/admin/" is "/admin" too.
  const path = useLocation().pathname.replace(/\/+$/, '') || '/'
  useAppManifest(path === '/admin' || auth === 'authenticated')

  let downtime: Downtime | null = null
  if (auth !== 'authenticated' && !ALWAYS_OPEN.includes(path)) {
    if (site.status === 'unreachable') downtime = { reason: 'unreachable' }
    else if (site.status === 'loaded' && site.site.maintenance && auth === 'anonymous') downtime = { reason: 'maintenance', message: site.site.maintenanceMessage }
  }
  if (downtime) return <AppLayout downtime={downtime} />

  return (
    <>
      <AnalyticsTracker />
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            index
            element={
              <VisiblePage page="whatsNew">
                <WhatsNewPage />
              </VisiblePage>
            }
          />
          <Route
            path="apps"
            element={
              <VisiblePage page="apps">
                <AppsPage />
              </VisiblePage>
            }
          />
          <Route
            path="youtube"
            element={
              <VisiblePage page="youtube">
                <YouTubePage />
              </VisiblePage>
            }
          />
          <Route
            path="about"
            element={
              <VisiblePage page="about">
                <AboutPage />
              </VisiblePage>
            }
          />
          <Route
            path="contact"
            element={
              <VisiblePage page="contact">
                <ContactPage />
              </VisiblePage>
            }
          />
          <Route path="coming-soon" element={<ComingSoonPage />} />
          <Route path="engagement" element={<EngagementPage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* System's own address: its first page. */}
          <Route path="system" element={<Navigate to="/engagement" replace />} />
          <Route path="features" element={<FeatureTestingPage />} />
          <Route path="features/:feature" element={<FeatureTestingPage />} />
          {/* The link in an answer's email: works while the Contact page is hidden, and during maintenance. */}
          <Route path="updates/confirm" element={<ConfirmSubscriptionPage />} />
          <Route path="updates/unsubscribe" element={<UnsubscribePage />} />
        </Route>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TermsHost />
    </>
  )
}

export default App
