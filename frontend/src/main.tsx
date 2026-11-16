import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/mr-dafoe/latin.css'
import '@/app/styles/index.css'
import '@/app/styles/glass.css'
import App from '@/app/App'
import { Provider } from 'react-redux'
import { tracker } from '@/shared/lib/analytics'
import { watchIdle } from '@/shared/lib/browser'
import { showTheme } from '@/shared/lib/theme'
import { makeStore } from '@/app/model'

const store = makeStore()
// Before the first render, so the page never flashes the wrong theme.
showTheme(store.getState().theme.theme)
// Nobody using the page for a minute: what moves on its own holds still (shared/lib/browser/idle.ts).
watchIdle()

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
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
