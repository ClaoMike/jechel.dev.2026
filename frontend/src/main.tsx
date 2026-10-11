import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/mr-dafoe/latin.css'
import './index.css'
import './glass.css'
import App from './App.tsx'
import { AuthProvider } from './auth'
import { storedTheme } from './layout/theme'

// Before the first render, so the page never flashes the wrong theme.
document.documentElement.dataset.theme = storedTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
