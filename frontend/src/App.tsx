import { Navigate, Route, Routes } from 'react-router'
import { AnalyticsTracker } from './features/analytics'
import { TermsProvider } from './features/terms'
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

function App() {
  return (
    <TermsProvider>
      <AnalyticsTracker />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<WhatsNewPage />} />
          <Route path="apps" element={<AppsPage />} />
          <Route path="youtube" element={<YouTubePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
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
