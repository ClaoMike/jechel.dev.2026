import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// WEB_PORT and API_URL run a second copy next to the usual one (other ports, another API).
const webPort = Number(process.env.WEB_PORT ?? 5173)
const apiUrl = process.env.API_URL ?? 'http://localhost:5105'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // @/<layer>/<slice>: Feature-Sliced Design's imports across slices (tsconfig.app.json's paths).
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Pre-bundled up front: found halfway through a test run (a fresh cache, as in CI), Vite would reload the
  // test page and the tests in it fail ("Vite unexpectedly reloaded a test").
  optimizeDeps: {
    include: ['react-dom/client'],
  },
  server: {
    port: webPort,
    strictPort: true,
    // Same-origin API calls: keeps the auth cookie first-party and needs no CORS.
    // xfwd sends X-Forwarded-Host/Proto so the API builds Google's callback URL
    // as http://localhost:5173/api/auth/signin-google (the URL the browser sees).
    // Not for tests (VITEST): they never reach an API, not even for an image or a video's address.
    proxy: process.env.VITEST
      ? undefined
      : {
          '/api': { target: apiUrl, xfwd: true },
        },
  },
  // The production build served locally (`vite preview`, what the end-to-end tests in e2e/ run against), the API behind it the same way.
  preview: {
    port: webPort,
    strictPort: true,
    proxy: { '/api': { target: apiUrl, xfwd: true } },
  },
  // Tests run in a real browser (headless Chromium), so views get the site's own CSS: layout, themes
  // and screenshots are the real thing. The API is never called: tests stub `api` (src/test/).
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    browser: {
      enabled: true,
      // Reduced motion, as some visitors have it (Vice's scene draws one still frame), and a fixed locale and time zone: stable screenshots.
      provider: playwright({ contextOptions: { reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'Europe/London' } }),
      headless: true,
      instances: [{ browser: 'chromium' }],
      viewport: { width: 1280, height: 900 },
      expect: {
        toMatchScreenshot: {
          // Small anti-aliasing differences between runs aren't changes.
          comparatorName: 'pixelmatch',
          comparatorOptions: { threshold: 0.2, allowedMismatchedPixelRatio: 0.002 },
        },
      },
    },
    // Every source file counts, tested or not, so the report shows what isn't covered yet.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts', 'src/main.tsx'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Written even when a test fails, so every run shows what's covered.
      reportOnFailure: true,
    },
  },
})
