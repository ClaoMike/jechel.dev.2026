import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../auth'
import { makeStore } from '../store'

/** Renders the whole app (store + routes + auth) at the given URL, with a fresh store. */
export function renderApp(url = '/') {
  const store = makeStore()
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[url]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </Provider>,
    ),
  }
}
