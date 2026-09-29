import { defineConfig, devices } from '@playwright/test'

/** Viewer smoke tests against the bundled demo graph (WebGL runs on SwiftShader in headless Chromium). */
export default defineConfig({
  testDir: './e2e',
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5299',
    trace: 'on-first-retry',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node src/cli.ts serve --no-open --port 5299 --graph viewer/public/samples/demo.graph.json',
    url: 'http://127.0.0.1:5299/graph.json',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
