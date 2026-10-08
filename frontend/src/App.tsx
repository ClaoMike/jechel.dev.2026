import { Navigate, Route, Routes } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { AdminPage } from './pages/AdminPage'
import { ContactPage } from './pages/ContactPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<PlaceholderPage title="What's new?" text="News and updates will show up here soon." />} />
        <Route path="apps" element={<PlaceholderPage title="Apps" text="The apps I build will be listed here soon." />} />
        <Route path="youtube" element={<PlaceholderPage title="YouTube" text="My YouTube videos will be here soon." />} />
        <Route path="about" element={<PlaceholderPage title="About Me" text="More about me is coming soon." />} />
        <Route path="contact" element={<ContactPage />} />
      </Route>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
