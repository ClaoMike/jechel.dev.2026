import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useSessionKeeper } from '@/entities/session'
import { AnalyticsTracker } from '@/features/analytics'
import { useLoadSite } from '@/entities/site'
import { ComingSoonPage } from '@/pages/coming-soon'
import { VisiblePage } from '@/entities/site'
import { TermsHost } from '@/features/accept-terms'
import { AppLayout, type Downtime } from './layout/AppLayout'
import { useAppManifest } from './manifest'
import { AppsPage } from '@/pages/apps'
import { AboutPage } from '@/pages/about'
import { AdminPage } from '@/pages/admin'
import { CommunityPage } from '@/pages/community'
import { ContactPage } from '@/pages/contact'
import { EngagementPage } from '@/pages/engagement'
import { NotificationsPage } from '@/pages/notifications'
import { FeatureTestingPage } from '@/pages/feature-testing'
import { SettingsPage } from '@/pages/settings'
import { TermsPage } from '@/pages/terms'
import { ConfirmSubscriptionPage } from '@/pages/confirm-subscription'
import { UnsubscribePage } from '@/pages/unsubscribe'
import { WhatsNewPage } from '@/pages/whats-new'
import { YouTubePage } from '@/pages/youtube'
import { useAppSelector } from '@/shared/lib/store'

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
