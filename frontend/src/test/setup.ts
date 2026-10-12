import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { rememberAcceptance } from '../features/terms/acceptance'
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// Visitors have accepted the default terms, so the welcome popup stays out of the way; its own tests clear this.
beforeEach(() => rememberAcceptance('default'))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterAll(() => server.close())
