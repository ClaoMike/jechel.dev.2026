import { Navigate, Route, Routes } from 'react-router'
import { AnalyticsTracker } from './features/analytics'
import { TermsProvider } from './features/terms'
import { AppLayout } from './layout/AppLayout'
import { AppsPage } from './pages/AppsPage'
import { AboutPage } from './pages/AboutPage'
import { AdminPage } from './pages/AdminPage'
import { ContactPage } from './pages/ContactPage'
import { EngagementPage } from './pages/EngagementPage'
import { TermsPage } from './pages/TermsPage'
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
          <Route path="terms" element={<TermsPage />} />
        </Route>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TermsProvider>
  )
}

export default App
