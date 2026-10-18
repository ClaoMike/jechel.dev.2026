import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { rememberAcceptance } from '../features/terms/acceptance'
import { server } from './server'

// jsdom has no WebGL, so it would always count as a weak device (no Vice). Tests start as a capable
// one; layout/device.test.ts tests the real checks, and theme tests switch this per test.
vi.mock('../layout/device', async (importActual) => ({ ...(await importActual<typeof import('../layout/device')>()), isLowPowerDevice: vi.fn(() => false) }))

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
