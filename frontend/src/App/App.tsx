import { Navigate, Route, Routes } from 'react-router'
import { useAppViewModel } from './App.viewModel'
import { AnalyticsTracker } from '../features/analytics'
import { ComingSoonPage } from '../features/site/ComingSoonPage/ComingSoonPage'
import { VisiblePage } from '../features/site/VisiblePage/VisiblePage'
import { TermsHost } from '../features/terms'
import { AppLayout } from '../layout/AppLayout/AppLayout'
import { AppsPage } from '../pages/AppsPage/AppsPage'
import { AboutPage } from '../pages/AboutPage/AboutPage'
import { AdminPage } from '../pages/AdminPage/AdminPage'
import { CommunityPage } from '../pages/CommunityPage/CommunityPage'
import { ContactPage } from '../pages/ContactPage/ContactPage'
import { EngagementPage } from '../pages/EngagementPage/EngagementPage'
import { NotificationsPage } from '../pages/NotificationsPage/NotificationsPage'
import { SettingsPage } from '../pages/SettingsPage/SettingsPage'
import { TermsPage } from '../pages/TermsPage/TermsPage'
import { ConfirmSubscriptionPage } from '../pages/ConfirmSubscriptionPage/ConfirmSubscriptionPage'
import { UnsubscribePage } from '../pages/UnsubscribePage/UnsubscribePage'
import { WhatsNewPage } from '../pages/WhatsNewPage/WhatsNewPage'
import { YouTubePage } from '../pages/YouTubePage/YouTubePage'

function App() {
  const vm = useAppViewModel()
  if (vm.downtime) return <AppLayout downtime={vm.downtime} />

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
