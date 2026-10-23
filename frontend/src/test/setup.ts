/**
 * Runs before every test file, in the browser: the site's own CSS (so layout, themes and screenshots
 * are the real ones), and a clean slate after each test.
 */
import '@fontsource/mr-dafoe/latin.css'
import '../index.css'
import '../glass.css'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { cleanup } from 'vitest-browser-react'
import { fakeHttp } from './http'

// Screenshots must not catch an animation halfway (skeleton shimmer, neon, popups sliding in).
const still = document.createElement('style')
still.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'
document.head.append(still)

// The real API is never called: a request no test faked (stubApi, fakeHttp) fails the test that sent it.
let unfaked: string[] = []
beforeEach(() => {
  unfaked = []
  fakeHttp(({ method, url }) => {
    unfaked.push(`${method} ${url}`)
    return 'network-error'
  })
  vi.spyOn(navigator, 'sendBeacon').mockImplementation((url) => (unfaked.push(`beacon ${url}`), true))
})

afterEach(async () => {
  // Unmounted while the fakes are still in place (the library would only do it before the next test): a page
  // left on would otherwise go on asking, a timer or a prefetch reaching the real API under the next test.
  await cleanup()
  vi.restoreAllMocks()
  // E.g. fakeHttp's XMLHttpRequest, and Vite's mode for the development-only parts.
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  // Paging scrolls the grid into view, the test runner's page around this frame too; the next test starts at the top.
  for (let win: Window = window; ; win = win.parent) {
    win.scrollTo(0, 0)
    if (win === win.parent) break
  }
  delete document.documentElement.dataset.theme
  localStorage.clear()
  sessionStorage.clear()
  // Last, so a failing test still leaves a clean slate for the next one.
  expect(unfaked, 'requests to the real API (fake them with stubApi or fakeHttp)').toEqual([])
})
