/**
 * Before the tests (run.sh): every browser must be the newest release there is. Each one is started for its version,
 * which is compared with what its maker publishes as current: Google (Chrome's stable channel), Microsoft (Edge's),
 * Mozilla (Firefox's), and npm (Playwright, whose WebKit is the Safari engine tested). An older one stops the run,
 * saying what to update. E2E_ALLOW_OUTDATED=1 runs anyway (with the warning), e.g. while a new release reaches you.
 */
import { chromium, firefox, webkit, type BrowserType } from '@playwright/test'
import { readFileSync } from 'node:fs'

const platform = process.platform === 'darwin' ? { chrome: 'mac', edge: 'MacOS' } : { chrome: 'linux', edge: 'Linux' }

/** "156.0.8078.47" < "156.0.8078.52"? Numbers compared part by part. */
function older(version: string, than: string) {
  const a = version.split('.').map(Number)
  const b = than.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  }
  return false
}

async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

/** Chrome's stable versions being rolled out now (Google ships one to a share of users first): the lowest counts as current. */
async function latestChrome() {
  const { releases } = await json(`https://versionhistory.googleapis.com/v1/chrome/platforms/${platform.chrome}/channels/stable/versions/all/releases?filter=endtime=none`)
  return (releases as { version: string }[]).map((r) => r.version).sort((a, b) => (older(a, b) ? -1 : 1))[0]
}

async function latestEdge() {
  const products = (await json('https://edgeupdates.microsoft.com/api/products')) as { Product: string; Releases: { Platform: string; ProductVersion: string }[] }[]
  const stable = products.find((p) => p.Product === 'Stable')!.Releases.filter((r) => r.Platform === platform.edge)
  return stable.map((r) => r.ProductVersion).sort((a, b) => (older(a, b) ? 1 : -1))[0]
}

async function latestFirefox() {
  return ((await json('https://product-details.mozilla.org/1.0/firefox_versions.json')) as { LATEST_FIREFOX_VERSION: string }).LATEST_FIREFOX_VERSION
}

async function latestPlaywright() {
  return ((await json('https://registry.npmjs.org/@playwright/test/latest')) as { version: string }).version
}

async function versionOf(type: BrowserType, options: Parameters<BrowserType['launch']>[0]) {
  const browser = await type.launch(options)
  const version = browser.version()
  await browser.close()
  return version
}

const playwrightVersion = (JSON.parse(readFileSync(new URL('./node_modules/@playwright/test/package.json', import.meta.url), 'utf8')) as { version: string }).version
const checks = [
  { name: 'Chrome', installed: () => versionOf(chromium, { channel: 'chrome' }), latest: latestChrome, update: 'Chrome → Settings → About Chrome' },
  { name: 'Edge', installed: () => versionOf(chromium, { channel: 'msedge' }), latest: latestEdge, update: 'Edge → Settings → About Microsoft Edge' },
  {
    name: 'Firefox',
    installed: () => versionOf(firefox, { channel: 'moz-firefox', executablePath: process.env.E2E_FIREFOX_PATH || undefined }),
    latest: latestFirefox,
    update: 'Firefox → About Firefox',
  },
  { name: 'Playwright (its WebKit: Safari)', installed: async () => playwrightVersion, latest: latestPlaywright, update: 'run.sh installs the latest: run it again' },
]

let outdated = 0
for (const check of checks) {
  const [installed, latest] = await Promise.all([check.installed(), check.latest()])
  const behind = older(installed, latest)
  if (behind) outdated++
  console.log(`  ${behind ? '✘' : '✓'} ${check.name} ${installed}${behind ? `: ${latest} is out (${check.update})` : ''}`)
}
console.log(`  · WebKit ${await versionOf(webkit, {})}`)

if (outdated > 0) {
  if (process.env.E2E_ALLOW_OUTDATED === '1') console.log('  Running anyway (E2E_ALLOW_OUTDATED=1).')
  else {
    console.error(`\n${outdated} browser${outdated === 1 ? ' is' : 's are'} behind: update, or run with E2E_ALLOW_OUTDATED=1.`)
    process.exit(1)
  }
}
