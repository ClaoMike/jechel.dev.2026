import { defineConfig, devices, type Project } from '@playwright/test'
import { VISITOR_STATE } from './tests/states.ts'

/**
 * End to end: the whole site as a visitor's browser gets it. The production build (vite preview), the real
 * API on a fresh PostgreSQL, and stand-ins for Google's sign-in, YouTube, Resend and ntfy (fakeServices.ts). Run with ./run.sh, which
 * starts the database and installs the latest Playwright and browsers first.
 *
 * Four browsers, each the latest: Chrome and Edge are the real ones (their stable channel, installed fresh),
 * Firefox and Safari are Playwright's builds of their engines (Safari: WebKit), from the latest Playwright.
 */
const API_PORT = process.env.E2E_API_PORT ?? '5205'
const WEB_PORT = process.env.E2E_WEB_PORT ?? '4273'
const SERVICES_PORT = process.env.E2E_SERVICES_PORT ?? '5299'
const DB_PORT = process.env.E2E_DB_PORT ?? '5434'
const API_URL = `http://localhost:${API_PORT}`
const WEB_URL = `http://localhost:${WEB_PORT}`
const SERVICES_URL = `http://localhost:${SERVICES_PORT}`

// Playwright's Firefox doesn't start on macOS 27, so on a Mac run.sh runs it in Playwright's Linux image (Docker)
// and the tests drive it from here (E2E_FIREFOX_WS); its localhost is this computer's.
const firefoxServer = process.env.E2E_FIREFOX_WS
const BROWSERS = [
  { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  // On a Mac, Edge started by Playwright hangs creating its graphics process (the Vice scene's WebGL): kept in the browser's own.
  { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', launchOptions: { args: process.platform === 'darwin' ? ['--in-process-gpu'] : [] } } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'], ...(firefoxServer && { connectOptions: { wsEndpoint: firefoxServer, exposeNetwork: '<loopback>' } }) } },
  { name: 'safari', use: { ...devices['Desktop Safari'] } },
] satisfies Project[]

// What changes the whole site for everyone (maintenance, pages switched off) runs once every browser's
// other tests are done, one browser after another, so it never pulls the floor from under another test.
const siteWide = BROWSERS.map((browser, i) => ({
  name: `${browser.name} site-wide`,
  testMatch: /\.sitewide\.ts$/,
  dependencies: i === 0 ? BROWSERS.map((b) => b.name) : [`${BROWSERS[i - 1].name} site-wide`],
  use: { ...browser.use, storageState: VISITOR_STATE },
}))

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Signs the admin in (through the stand-in for Google), accepts the terms, and adds the content the tests look at.
    { name: 'setup', testMatch: /\.setup\.ts$/, use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    ...BROWSERS.map((browser) => ({ ...browser, testMatch: /\.spec\.ts$/, dependencies: ['setup'], use: { ...browser.use, storageState: VISITOR_STATE } })),
    ...siteWide,
  ],
  webServer: [
    {
      command: 'node fakeServices.ts',
      env: { FAKE_SERVICES_PORT: SERVICES_PORT },
      url: `${SERVICES_URL}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Built by run.sh beforehand.
      command: 'dotnet run --no-build --no-launch-profile --project ../backend/src/Portfolio.Api',
      env: {
        ASPNETCORE_ENVIRONMENT: 'E2E',
        ASPNETCORE_URLS: API_URL,
        ConnectionStrings__Default: `Host=localhost;Port=${DB_PORT};Database=portfolio;Username=portfolio;Password=portfolio`,
        ConnectionStrings__Redis: '',
        Database__MigrateOnStartup: 'true',
        // Every visitor page shows (they start hidden otherwise; Settings → Visitor pages).
        Site__PagesVisibleByDefault: 'true',
        Auth__AdminEmails__0: 'admin@e2e.test',
        // Every outside service is the stand-in (only honoured in the E2E environment).
        E2E__Services: SERVICES_URL,
        Authentication__Google__ClientId: 'e2e',
        Authentication__Google__ClientSecret: 'e2e',
        YouTube__Channel: '@e2e',
        YouTube__ApiKey: 'e2e',
        Email__ResendApiKey: 'e2e',
        Email__From: 'jechel.dev <hello@e2e.test>',
        Email__UpdatesFrom: 'jechel.dev <updates@e2e.test>',
        Alerts__NtfyServer: `${SERVICES_URL}/ntfy`,
        Alerts__NtfyTopic: 'e2e',
        Site__PublicUrl: WEB_URL,
        // Every browser runs from this one address: the per-address limits would stop the tests, not a spammer.
        Updates__SubscribeLimitPer10Minutes: '1000',
        Contact__LimitPer10Minutes: '1000',
        Analytics__LimitPer10Minutes: '100000',
      },
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      // The production build (run.sh builds it), with /api passed to the API as on Cloudflare.
      command: 'npx vite preview',
      cwd: '../frontend',
      env: { WEB_PORT, API_URL },
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
