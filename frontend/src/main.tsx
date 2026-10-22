import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/mr-dafoe/latin.css'
import './index.css'
import './glass.css'
import App from './App/App.tsx'
import { Provider } from 'react-redux'
import { tracker } from './features/analytics'
import { watchIdle } from './layout/idle'
import { showTheme } from './layout/theme'
import { makeStore } from './store'

const store = makeStore()
// Before the first render, so the page never flashes the wrong theme.
showTheme(store.getState().theme.theme)
// Nobody using the page for a minute: what moves on its own holds still (layout/idle.ts).
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
