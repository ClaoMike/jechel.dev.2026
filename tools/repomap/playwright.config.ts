import { defineConfig, devices } from '@playwright/test'

/** Viewer tests against the bundled demo graph and history (WebGL runs on SwiftShader in headless Chromium). */
export default defineConfig({
  testDir: './e2e',
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5299',
    trace: 'on-first-retry',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'chromium', testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Phones: touch, a narrow screen, the drawer and bottom-sheet layout.
    { name: 'phone', testMatch: /\.mobile\.spec\.ts$/, use: { ...devices['Pixel 7'] } },
    // Safari's engine.
    { name: 'webkit', testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 }, launchOptions: {} } },
    // Firefox: in CI, or locally with ALL_BROWSERS=1 (it needs `npx playwright install firefox`).
    ...(process.env.CI || process.env.ALL_BROWSERS
      ? [{ name: 'firefox', testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 }, launchOptions: {} } }]
      : []),
  ],
  webServer: {
    command: 'node src/cli.ts serve --no-open --port 5299 --graph viewer/public/samples/demo.graph.json',
    url: 'http://127.0.0.1:5299/graph.json',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
