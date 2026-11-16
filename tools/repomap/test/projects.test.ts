/**
 * Projects (the Projects menu) and Docker (Start, Stop, Reload): names and the skeleton a new project gets, the ports it
 * is given, the registry and the config each project is mapped with, docker compose's arguments and output (against a
 * fake docker), and the server's routes behind the writing guard.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { loadConfig, TOOL_ROOT } from '../src/core/config.ts'
import { composeArgs, DockerRunner, parsePs } from '../src/core/docker.ts'
import { ProjectError, ProjectRegistry, projectConfig, projectId } from '../src/core/projects.ts'
import { choosePorts, projectNames, scaffoldProject, ScaffoldError } from '../src/core/scaffold.ts'
import { startServer, type ServerHandle } from '../src/core/serve.ts'
import type { DockerEvent, DockerStatus } from '../src/shared/projects.ts'
import type { RepoGraph } from '../src/shared/types.ts'

const dir = mkdtempSync(join(tmpdir(), 'repomap-projects-'))
const PORTS = { web: 8181, api: 5281, db: 5481 }

function allFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '.git' ? [] : allFiles(join(root, e.name))) : [join(root, e.name)]))
}

describe('a new project', () => {
  it('gets its names from what you call it', () => {
    assert.deepEqual(projectNames('My Shop'), { name: 'My Shop', slug: 'my-shop', namespace: 'MyShop', db: 'my_shop' })
    assert.deepEqual(projectNames('  workWithMe  site 2 '), { name: 'workWithMe site 2', slug: 'work-with-me-site-2', namespace: 'WorkWithMeSite2', db: 'work_with_me_site_2' })
    for (const bad of ['', '   ', '2fast', '<script>', 'x'.repeat(61)]) assert.throws(() => projectNames(bad), ScaffoldError, bad)
  })

  it('is the skeleton with its names and ports filled in, as a new repository with its files staged', () => {
    const result = scaffoldProject({ name: 'My Shop', parent: dir, ports: PORTS })
    const root = join(dir, 'my-shop')
    assert.equal(result.root, root)
    const files = allFiles(root).map((f) => relative(root, f))
    for (const expected of [
      'docker-compose.yml',
      'repomap.config.json',
      'frontend/steiger.config.ts',
      'frontend/src/pages/home/index.ts',
      'backend/MyShop.slnx',
      'backend/src/MyShop.Api/MyShop.Api.csproj',
      'backend/src/MyShop.Api/Features/Greetings/GetGreeting.cs',
      'backend/src/MyShop.Api/Common/IEndpoint.cs',
      'backend/tests/MyShop.Api.UnitTests/Architecture/VerticalSliceTests.cs',
    ]) {
      assert.ok(files.includes(expected), expected)
    }
    // Every placeholder is filled in, in paths and in contents.
    assert.deepEqual(
      files.filter((f) => /__[A-Z_]+__/.test(f) || /__[A-Z_]+__/.test(readFileSync(join(root, f), 'utf8'))),
      [],
    )
    assert.match(readFileSync(join(root, 'docker-compose.yml'), 'utf8'), /"8181:80"[\s\S]*"5481:5432"|"5481:5432"[\s\S]*"8181:80"/)
    assert.equal(JSON.parse(readFileSync(join(root, 'frontend/package.json'), 'utf8')).name, 'my-shop-frontend')
    assert.match(readFileSync(join(root, 'frontend/package.json'), 'utf8'), /"lint": "oxlint && steiger \.\/src"/)
    assert.match(readFileSync(join(root, 'backend/src/MyShop.Api/Features/Greetings/GetGreeting.cs'), 'utf8'), /namespace MyShop\.Api\.Features\.Greetings;/)
    // Its map: the stack preset, both architectures, the site's address for Open.
    const config = loadConfig(join(root, 'repomap.config.json'))
    assert.equal(config.name, 'My Shop')
    assert.deepEqual(
      config.board.architectures?.map((a) => a.root),
      ['frontend/src', 'backend/src/MyShop.Api'],
    )
    assert.equal(config.docker.url, 'http://localhost:8181')
    assert.ok(config.kinds.length > 10, 'the preset’s vocabulary')
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).split('\n')
    assert.ok(staged.includes('backend/src/MyShop.Api/Program.cs'))
    assert.equal(execFileSync('git', ['rev-list', '--all'], { cwd: root, encoding: 'utf8' }).trim(), '', 'nothing committed')
  })

  it('never goes into a folder that has something in it', () => {
    assert.throws(
      () => scaffoldProject({ name: 'My Shop', parent: dir, ports: PORTS }),
      (e: ScaffoldError) => e.status === 409,
    )
    assert.throws(() => scaffoldProject({ name: 'Other', parent: join(dir, 'nope'), ports: PORTS }), ScaffoldError)
  })

  it('gets ports nothing listens on and no other project has', async () => {
    const busy: Server = createServer()
    await new Promise<void>((r) => busy.listen(8081, '127.0.0.1', () => r())).catch(() => undefined)
    try {
      const ports = await choosePorts([{ web: 8082, api: 5201, db: 5441 }])
      assert.notEqual(ports.web, 8081)
      assert.notEqual(ports.web, 8082)
      assert.notEqual(ports.api, 5201)
      assert.notEqual(ports.db, 5441)
    } finally {
      busy.close()
    }
  })
})

describe('the projects', () => {
  const registry = new ProjectRegistry(join(dir, 'projects.json'))

  it('lists the one repomap started with, with its own config and output', () => {
    const config = loadConfig(join(TOOL_ROOT, 'repomap.config.json'))
    const started = registry.ensureStarted(config)
    assert.equal(started.id, projectId(config.repoRoot))
    assert.equal(projectConfig(started).output, config.output)
    assert.deepEqual(projectConfig(started).docker, { profiles: ['site'], url: 'http://localhost:8080' })
  })

  it('opens repositories: one with a config by its name, its map kept by repomap', () => {
    const shop = registry.add(join(dir, 'my-shop'))
    assert.equal(shop.name, 'My Shop')
    const config = projectConfig(shop)
    assert.equal(config.output, join(TOOL_ROOT, '.out', 'projects', shop.id, 'graph.json'))
    assert.equal(config.repoRoot, join(dir, 'my-shop'))
    // Saved again: the same entry.
    assert.equal(registry.add(join(dir, 'my-shop'), 'Shop').id, shop.id)
    assert.equal(registry.list().filter((p) => p.root === join(dir, 'my-shop')).length, 1)
    assert.equal(registry.get(shop.id)?.name, 'Shop')
  })

  it('maps a repository without a config with the stack preset', () => {
    const plain = join(dir, 'plain')
    mkdirSync(plain)
    execFileSync('git', ['init', '-q'], { cwd: plain })
    const entry = registry.add(plain)
    const config = projectConfig(entry)
    assert.equal(config.repoRoot, plain)
    assert.ok(config.plugins.some((p) => p.id === 'typescript'))
    assert.ok(config.output.startsWith(join(TOOL_ROOT, '.out', 'projects', entry.id)))
  })

  it('refuses what isn’t a repository', () => {
    const folder = join(dir, 'not-git')
    mkdirSync(folder)
    assert.throws(() => registry.add(folder), ProjectError)
    assert.throws(
      () => registry.add(join(dir, 'missing')),
      (e: ProjectError) => e.status === 404,
    )
  })
})

describe('docker compose', () => {
  it('runs each action with the project’s file and profiles', () => {
    assert.deepEqual(composeArgs('docker-compose.yml', ['site'], 'start'), [
      'compose',
      '-f',
      'docker-compose.yml',
      '--profile',
      'site',
      '--progress',
      'plain',
      'up',
      '-d',
      '--build',
    ])
    assert.deepEqual(composeArgs('compose.yaml', [], 'stop'), ['compose', '-f', 'compose.yaml', '--progress', 'plain', 'down'])
    assert.deepEqual(composeArgs('compose.yaml', [], 'reload').slice(-4), ['up', '-d', '--build', '--force-recreate'])
  })

  it('reads the services’ state, line by line or as one array', () => {
    const line = '{"Service":"db","State":"running","Health":"healthy"}\n{"Service":"web","State":"exited","Health":""}'
    assert.deepEqual(parsePs(line), [
      { name: 'db', state: 'running', health: 'healthy' },
      { name: 'web', state: 'exited' },
    ])
    assert.deepEqual(parsePs('[{"Service":"api","State":"Running"}]'), [{ name: 'api', state: 'running' }])
    assert.deepEqual(parsePs(''), [])
  })

  describe('against a fake docker', () => {
    const root = join(dir, 'my-shop')
    const state = join(dir, 'docker-state')
    const calls = join(dir, 'docker-calls')
    const previous = process.env.REPOMAP_DOCKER
    before(() => {
      // Up: every service runs; down: none does. Each call is written down.
      const fake = join(dir, 'fake-docker.mjs')
      writeFileSync(
        fake,
        `#!/usr/bin/env node
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(calls)}, args.join(' ') + '\\n')
if (args.includes('config')) { console.log('db\\napi\\nweb'); process.exit(0) }
if (args.includes('ps')) { if (existsSync(${JSON.stringify(state)})) for (const s of ['db', 'api', 'web']) console.log(JSON.stringify({ Service: s, State: 'running' })); process.exit(0) }
if (args.includes('up')) { console.error(' Container web Started'); writeFileSync(${JSON.stringify(state)}, 'up'); process.exit(0) }
if (args.includes('down')) { console.error(' Container web Removed'); process.exit(3) }
`,
      )
      chmodSync(fake, 0o755)
      process.env.REPOMAP_DOCKER = fake
    })
    after(() => {
      if (previous === undefined) delete process.env.REPOMAP_DOCKER
      else process.env.REPOMAP_DOCKER = previous
    })

    it('starts, streams the output, says how it went, and runs one action at a time', async () => {
      const events: DockerEvent[] = []
      const runner = new DockerRunner(root, { profiles: [], url: 'http://localhost:8181' }, (e) => events.push(e))
      const before = await runner.status()
      assert.deepEqual(
        before.services.map((s) => s.state),
        ['not created', 'not created', 'not created'],
      )
      assert.equal(before.running, false)
      const started = await runner.start('start')
      assert.equal(started.busy?.action, 'start')
      await assert.rejects(runner.start('stop'), /already busy/)
      await waitFor(() => events.some((e) => !e.status.busy))
      assert.ok(events.some((e) => e.line?.includes('Container web Started')))
      const done = events.at(-1)!.status
      assert.equal(done.running, true)
      assert.equal(done.last?.ok, true)
      assert.equal(done.url, 'http://localhost:8181')

      // A failing action is said so, with its output.
      await runner.start('stop')
      await waitFor(() => events.filter((e) => !e.status.busy).length === 2)
      assert.equal(events.at(-1)!.status.last?.ok, false)
      assert.match(events.at(-1)!.status.last?.output ?? '', /Container web Removed/)
      assert.match(readFileSync(calls, 'utf8'), /compose -f docker-compose.yml --progress plain up -d --build/)
    })

    it('says when there is nothing to run', async () => {
      const empty = join(dir, 'plain')
      const status = await new DockerRunner(empty, { profiles: [] }, () => {}).start('start').catch((e: Error) => e)
      assert.match(String(status), /no docker-compose.yml/)
    })
  })
})

describe('server routes', () => {
  let server: ServerHandle
  const opened: string[] = []
  const actions: string[] = []
  before(async () => {
    const out = join(dir, 'serve')
    mkdirSync(out, { recursive: true })
    const graph: RepoGraph = {
      version: 1,
      meta: {
        tool: { name: 'repomap', version: 'test' },
        repo: { name: 'shop', root: join(dir, 'my-shop') },
        generatedAt: '2026-01-01T00:00:00Z',
        layers: [],
        roles: [],
        kinds: [],
        edgeTypes: [],
      },
      nodes: [],
      edges: [],
      unresolved: [],
    }
    writeFileSync(join(out, 'graph.json'), JSON.stringify(graph))
    const status: DockerStatus = { available: true, compose: true, services: [], running: false }
    server = await startServer({
      graphPath: join(out, 'graph.json'),
      repoRoot: join(dir, 'my-shop'),
      port: 0,
      host: '127.0.0.1',
      writable: true,
      projects: {
        view: () => ({ current: 'a', projects: [], defaultParent: dir }),
        open: (id) => {
          if (id !== 'b') throw new ProjectError('No such project.', 404)
          opened.push(id)
        },
        add: () => {
          throw new ProjectError('nope')
        },
        create: async (name) => {
          projectNames(name)
          return { id: 'n', name, root: dir, current: false, missing: false }
        },
      },
      docker: {
        status: async () => status,
        start: async (action) => {
          actions.push(action)
          return { ...status, busy: { action, startedAt: 'now' } }
        },
      },
    })
  })
  after(() => server.close())

  const call = async (path: string, body?: unknown, headers: Record<string, string> = { 'X-Repomap-Request': '1' }) => {
    const response = await fetch(`${server.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> }
  }

  it('says projects and Docker are offered', async () => {
    const info = await call('/api/info')
    assert.deepEqual([info.body.projects, info.body.docker], [true, true])
  })

  it('lists, opens and creates projects, with the errors said plainly', async () => {
    assert.equal((await call('/api/projects')).body.current, 'a')
    assert.equal((await call('/api/projects/open', { id: 'b' })).status, 202)
    assert.deepEqual(opened, ['b'])
    assert.equal((await call('/api/projects/open', { id: 'zzz' })).status, 404)
    assert.equal((await call('/api/projects/add', { path: '/x' })).status, 400)
    assert.equal((await call('/api/projects/create', { name: 'New One', parent: dir })).status, 201)
    const bad = await call('/api/projects/create', { name: '', parent: dir })
    assert.equal(bad.status, 400)
    assert.match(String(bad.body.error), /name/)
  })

  it('starts Docker actions, and only the three', async () => {
    assert.equal((await call('/api/docker')).body.available, true)
    assert.equal((await call('/api/docker', { action: 'reload' })).status, 202)
    assert.equal((await call('/api/docker', { action: 'rm -rf' })).status, 400)
    assert.deepEqual(actions, ['reload'])
  })

  it('refuses both without the viewer’s header', async () => {
    assert.equal((await call('/api/docker', { action: 'stop' }, {})).status, 403)
    assert.equal((await call('/api/projects/create', { name: 'X', parent: dir }, {})).status, 403)
    assert.deepEqual(actions, ['reload'])
  })
})

describe('preset references', () => {
  it('a config anywhere extends a stack preset by name', () => {
    const folder = join(dir, 'preset-ref')
    mkdirSync(folder)
    writeFileSync(join(folder, 'repomap.config.json'), '{ "extends": "preset:react-aspnet-efcore-postgres", "name": "x" }')
    const config = loadConfig(join(folder, 'repomap.config.json'))
    assert.ok(config.plugins.some((p) => p.id === 'dotnet'))
    assert.ok(statSync(join(TOOL_ROOT, 'presets', 'react-aspnet-efcore-postgres.json')).isFile())
    assert.equal(existsSync(join(folder, '.out')), false)
  })
})

async function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  const until = Date.now() + timeout
  while (!condition()) {
    if (Date.now() > until) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}
