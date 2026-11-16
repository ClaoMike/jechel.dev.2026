/**
 * The Projects menu and Docker, against `repomap serve` itself (the real switch between projects, real maps built by the
 * pipeline): opening a repository, creating a project from the skeleton, and Start / Stop / Reload with a fake docker
 * that remembers whether the project is up. The registry is a temporary file.
 */
import { expect, test as base, type Page } from '@playwright/test'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/core/config.ts'
import { createLogger } from '../src/core/log.ts'
import { scaffoldProject } from '../src/core/scaffold.ts'
import { serve } from '../src/core/serve.ts'
import { violations, watchErrors } from './helpers.ts'

interface Projects {
  url: string
  dir: string
}

const test = base.extend<{ projects: Projects }>({
  projects: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'repomap-e2e-projects-'))
    process.env.REPOMAP_PROJECTS = join(dir, 'projects.json')
    // Up: every service runs (a file per project says so); down: none does.
    const fake = join(dir, 'docker.mjs')
    writeFileSync(
      fake,
      `#!/usr/bin/env node
import { existsSync, rmSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const up = process.cwd() + '/.docker-up'
if (args.includes('config')) { console.log('db\\napi\\nweb'); process.exit(0) }
if (args.includes('ps')) { if (existsSync(up)) for (const s of ['db', 'api', 'web']) console.log(JSON.stringify({ Service: s, State: 'running' })); process.exit(0) }
if (args.includes('up')) { for (const s of ['db', 'api', 'web']) console.error(' Container ' + s + ' Started'); writeFileSync(up, ''); process.exit(0) }
if (args.includes('down')) { console.error(' Container web Removed'); rmSync(up, { force: true }); process.exit(0) }
`,
    )
    chmodSync(fake, 0o755)
    process.env.REPOMAP_DOCKER = fake
    const alpha = scaffoldProject({ name: 'Alpha', parent: dir, ports: { web: 8191, api: 5291, db: 5491 } })
    scaffoldProject({ name: 'Beta Site', parent: dir, ports: { web: 8192, api: 5292, db: 5492 } })
    const server = await serve({
      config: loadConfig(join(alpha.root, 'repomap.config.json'), { output: join(dir, 'out', 'graph.json') }),
      log: createLogger({ quiet: true }),
      port: 0,
      host: '127.0.0.1',
      open: false,
      watch: false,
      build: true,
    })
    await use({ url: server.url, dir })
    await server.close()
  },
})

const repoName = (page: Page) => page.locator('.repo strong')

test.describe('projects', () => {
  test.setTimeout(180_000)

  test('opens another repository, and runs it with Start, Stop and Reload', async ({ page, projects }) => {
    const errors = watchErrors(page)
    await page.goto(projects.url)
    await expect(repoName(page)).toHaveText('Alpha', { timeout: 30_000 })
    await page.getByTestId('project-menu').click()
    await expect(page.getByRole('menuitem', { name: /Alpha/ })).toBeDisabled()
    await page.getByRole('menuitem', { name: 'Open a repository…' }).click()
    const dialog = page.getByTestId('project-open-dialog')
    await dialog.getByTestId('project-path').fill(join(projects.dir, 'nowhere'))
    await dialog.getByRole('button', { name: 'Open' }).click()
    await expect(dialog.getByRole('alert')).toContainText('There is no folder')
    await dialog.getByTestId('project-path').fill(join(projects.dir, 'beta-site'))
    await dialog.getByRole('button', { name: 'Open' }).click()
    // Its map is built, then the server serves it: the page comes back on it.
    await expect(repoName(page)).toHaveText('Beta Site', { timeout: 120_000 })

    const state = page.getByTestId('docker-state')
    await expect(state).toContainText('Stopped')
    await expect(page.getByTestId('docker-stop')).toBeDisabled()
    await page.getByTestId('docker-start').click()
    await expect(state).toContainText('Running', { timeout: 20_000 })
    await expect(page.getByTestId('docker-open')).toHaveAttribute('href', 'http://localhost:8192')
    await state.click()
    const log = page.getByTestId('docker-log')
    await expect(log).toContainText('Container web Started')
    await expect(log).toContainText('web running')
    expect(await violations(page)).toEqual([])
    await page.keyboard.press('Escape')
    await page.getByTestId('docker-reload').click()
    await expect(state).toContainText('Running', { timeout: 20_000 })
    await page.getByTestId('docker-stop').click()
    await expect(state).toContainText('Stopped', { timeout: 20_000 })

    // Back to the first one, from the menu.
    await page.getByTestId('project-menu').click()
    await page.getByRole('menuitem', { name: /Alpha/ }).click()
    await expect(repoName(page)).toHaveText('Alpha', { timeout: 120_000 })
    // Only the folder that isn't there (the browser logs the refused request).
    expect(errors).toEqual([expect.stringContaining('404')])
  })

  test('creates a project from the skeleton, and opens its board in its architectures', async ({ page, projects }) => {
    await page.goto(projects.url)
    await expect(repoName(page)).toHaveText('Alpha', { timeout: 30_000 })
    await page.getByTestId('project-menu').click()
    await page.getByRole('menuitem', { name: 'New project…' }).click()
    const dialog = page.getByTestId('project-create-dialog')
    await expect(dialog.getByTestId('project-parent')).toHaveValue(projects.dir)
    await dialog.getByTestId('project-name').fill('Alpha')
    await expect(dialog).toContainText(`It goes in ${projects.dir}/alpha`)
    expect(await violations(page)).toEqual([])
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog.getByRole('alert')).toContainText('already exists')
    await dialog.getByTestId('project-name').fill('Gamma Shop')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(repoName(page)).toHaveText('Gamma Shop', { timeout: 120_000 })

    await page.goto(`${projects.url}/#board=features~frontend`)
    await expect(page.getByTestId('board-architecture')).toHaveText(/Feature-Sliced Design/)
    await expect
      .poll(() => page.locator('[data-lane]').evaluateAll((lanes) => lanes.map((l) => l.getAttribute('data-lane'))))
      .toEqual(['App', 'Pages', 'Shared', 'Outside Feature-Sliced Design'])
    await page.goto(`${projects.url}/#board=chips~backend~vsa%2FFeatures%2FGreetings~`)
    await expect(page.getByTestId('board-architecture')).toHaveText(/Vertical slices.*Features.*Greetings/)
    await expect(page.locator('[data-chip$="GetGreeting"]')).toBeVisible()
  })
})
