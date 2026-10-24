/**
 * The screenshot references are per OS, and a new Playwright (a new Chromium) can draw a pixel differently, so each OS's
 * are taken with a known Playwright (src/test/screenshotsTakenWith.json). CI keeps Playwright at the newest (ci.yml) and
 * retakes the Linux ones when it moves. Before the tests (npm test):
 *
 *   node scripts/screenshots.ts          on CI: the Linux ones must be from this Playwright; elsewhere (your Mac): after
 *                                        Playwright changed, this OS's are retaken (CI already checked the change on Linux)
 *   node scripts/screenshots.ts retake   this OS's, taken again from scratch with this Playwright
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const recordFile = new URL('../src/test/screenshotsTakenWith.json', import.meta.url)
const record = JSON.parse(readFileSync(recordFile, 'utf8')) as Record<string, string>
const os = process.platform
const playwright = (JSON.parse(readFileSync(new URL('../node_modules/playwright/package.json', import.meta.url), 'utf8')) as { version: string }).version

function retake() {
  console.log(`Taking the ${os} screenshots with Playwright ${playwright}.`)
  execFileSync('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' })
  // From scratch: --update keeps a reference the new render still matches within the tolerance.
  for (const file of readdirSync('src', { recursive: true, encoding: 'utf8' })) {
    if (file.includes('__screenshots__') && file.endsWith(`-chromium-${os}.png`)) rmSync(join('src', file))
  }
  execFileSync('npx', ['vitest', 'run', '--update'], { stdio: 'inherit' })
  writeFileSync(recordFile, JSON.stringify({ ...record, [os]: playwright }, null, 2) + '\n')
}

if (process.argv[2] === 'retake') retake()
else if (record[os] !== playwright) {
  if (process.env.CI) {
    console.error(`The ${os} screenshots are from Playwright ${record[os]}, the tests run ${playwright}: retake them (Actions → Update Linux screenshots).`)
    process.exit(1)
  }
  console.log(`Playwright went from ${record[os] ?? 'unknown'} to ${playwright}.`)
  retake()
}
