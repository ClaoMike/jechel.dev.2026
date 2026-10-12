import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../auth'
import { setTheme } from '../../layout/theme'
import { AnalyticsTracker } from './AnalyticsTracker'
import { createTracker, THEME_CHANGED } from './tracker'

beforeEach(() => sessionStorage.clear())

function renderTracker() {
  const tracker = createTracker({ send: vi.fn(async () => {}), beacon: vi.fn(() => true) })
  render(
    <MemoryRouter initialEntries={['/about']}>
      <AuthProvider>
        <AnalyticsTracker instance={tracker} />
      </AuthProvider>
    </MemoryRouter>,
  )
  return tracker
}

describe('AnalyticsTracker', () => {
  it('records the page opened', () => {
    const tracker = renderTracker()

    expect(tracker.state.queued.map((e) => [e.type, e.path])).toEqual([['pageview', '/about']])
  })

  it('records each theme switch, from and to', () => {
    const tracker = renderTracker()

    act(() => setTheme('dark'))
    act(() => setTheme('light'))

    const switches = tracker.state.queued.filter((e) => e.label === THEME_CHANGED).map((e) => e.detail)
    expect(switches).toEqual([
      { from: 'vice', to: 'dark' },
      { from: 'dark', to: 'light' },
    ])
  })
})
