import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'

/** Renders the whole app (routes + auth) at the given URL. */
export function renderApp(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}
