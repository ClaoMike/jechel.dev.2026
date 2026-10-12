import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/mr-dafoe/latin.css'
import './index.css'
import './glass.css'
import App from './App.tsx'
import { AuthProvider } from './auth'
import { tracker } from './features/analytics'
import { storedTheme } from './layout/theme'

// Before the first render, so the page never flashes the wrong theme.
document.documentElement.dataset.theme = storedTheme()

// React's own error reports, recorded for the Engagement tab (and still logged, as React would).
createRoot(document.getElementById('root')!, {
  onUncaughtError(error, info) {
    tracker.reactError(error, info.componentStack, false)
    console.error(error)
  },
  onCaughtError(error, info) {
    tracker.reactError(error, info.componentStack, true)
    console.error(error)
  },
}).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
