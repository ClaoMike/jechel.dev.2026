import { defineConfig, devices } from '@playwright/test'
import { TERMS_ACCEPTED } from './e2e/termsState.ts'

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
    // Accepts the terms in the welcome popup once; every other test starts with them accepted.
    { name: 'setup', testMatch: /\.setup\.ts$/, use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], storageState: TERMS_ACCEPTED } },
    { name: 'webkit', dependencies: ['setup'], use: { ...devices['Desktop Safari'], storageState: TERMS_ACCEPTED } },
    // Playwright's Firefox build currently fails to launch on macOS 27, so it only runs in CI (Linux).
    ...(process.env.CI ? [{ name: 'firefox', dependencies: ['setup'], use: { ...devices['Desktop Firefox'], storageState: TERMS_ACCEPTED } }] : []),
  ],
  webServer: [
    {
      command: `dotnet run --project ../backend/src/Portfolio.Api --launch-profile http --urls ${API_URL}`,
      // Every visitor page shows (they start hidden otherwise; Settings → Visitor pages).
      env: { Site__PagesVisibleByDefault: 'true' },
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
