import { defineConfig, devices } from '@playwright/test'

// Override to test on other ports while the usual dev servers keep running, e.g.
// API_PORT=5205 WEB_PORT=5273 ConnectionStrings__Default=… npx playwright test
const API_PORT = process.env.API_PORT ?? '5105'
const WEB_PORT = process.env.WEB_PORT ?? '5173'
const API_URL = `http://localhost:${API_PORT}`
const WEB_URL = `http://localhost:${WEB_PORT}`

/**
 * Full-stack E2E: boots the real .NET API (which migrates + seeds PostgreSQL)
 * and the Vite dev server. Requires the database to be running (`docker compose up -d`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Playwright's Firefox build currently fails to launch on macOS 27, so it only runs in CI (Linux).
    ...(process.env.CI ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }] : []),
  ],
  webServer: [
    {
      command: `dotnet run --project ../backend/src/Portfolio.Api --launch-profile http --urls ${API_URL}`,
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      env: { WEB_PORT, API_URL },
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
