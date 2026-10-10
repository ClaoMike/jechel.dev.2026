import { Navigate, Route, Routes } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { AppsPage } from './pages/AppsPage'
import { AboutPage } from './pages/AboutPage'
import { AdminPage } from './pages/AdminPage'
import { ContactPage } from './pages/ContactPage'
import { WhatsNewPage } from './pages/WhatsNewPage'
import { YouTubePage } from './pages/YouTubePage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<WhatsNewPage />} />
        <Route path="apps" element={<AppsPage />} />
        <Route path="youtube" element={<YouTubePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
      </Route>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
