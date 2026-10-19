/**
 * Runs before every test file, in the browser: the site's own CSS (so layout, themes and screenshots
 * are the real ones), and a clean slate after each test.
 */
import '@fontsource/mr-dafoe/latin.css'
import '../index.css'
import '../glass.css'
import { afterEach, vi } from 'vitest'

// Screenshots must not catch an animation halfway (skeleton shimmer, neon, popups sliding in).
const still = document.createElement('style')
still.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'
document.head.append(still)

afterEach(() => {
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
  localStorage.clear()
  sessionStorage.clear()
})
