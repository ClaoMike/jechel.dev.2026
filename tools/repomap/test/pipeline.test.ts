/**
 * End-to-end: runs every plugin against the repository this tool lives in (jechel.dev.2026) and checks
 * the architecture facts we care about. Skipped when the .NET SDK is not installed.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, describe, it } from 'node:test'
import { buildGraph } from '../src/core/build.ts'
import { loadConfig, TOOL_ROOT } from '../src/core/config.ts'
import { createLogger } from '../src/core/log.ts'
import { validateGraph } from '../src/core/validate.ts'
import type { RepoGraph } from '../src/shared/types.ts'

const hasDotnet = !spawnSync('dotnet', ['--version'], { stdio: 'ignore' }).error

describe('pipeline on this repository', { skip: !hasDotnet && 'dotnet SDK not found', timeout: 600_000 }, () => {
  let graph: RepoGraph
  const id = (label: string) => {
    const node = graph.nodes.find((n) => n.label === label)
    assert.ok(node, `node "${label}" exists`)
    return node.id
  }
  const hasEdge = (from: string, type: string, to: string) => graph.edges.some((e) => e.from === id(from) && e.type === type && e.to === id(to))

  before(async () => {
    const config = loadConfig(join(TOOL_ROOT, 'repomap.config.json'))
    config.output = join(mkdtempSync(join(tmpdir(), 'repomap-pipeline-')), 'graph.json')
    graph = (await buildGraph(config, { log: createLogger({ quiet: true }) })).graph
  })

  it('produces a valid graph where every node has a layer and a role', () => {
    assert.deepEqual(validateGraph(graph), [])
    for (const node of graph.nodes) {
      assert.ok(node.layer && node.role, `${node.id} has layer and role`)
    }
  })

  it('finds every endpoint of the API table in the README, with full MapGroup routes', () => {
    const endpoints = graph.nodes.filter((n) => n.kind === 'endpoint' && n.role === 'production').map((n) => n.label)
    for (const route of ['ANY /api/health', 'GET /api/firstname', 'GET /api/auth/login', 'GET /api/auth/me', 'POST /api/auth/logout', 'GET /api/auth/signin-google']) {
      assert.ok(endpoints.includes(route), `${route} in ${endpoints.join(', ')}`)
    }
    const me = graph.nodes.find((n) => n.label === 'GET /api/auth/me')!
    assert.equal(me.attrs?.auth, 'required')
  })

  it('links the chain page → API call → endpoint → entity property → column', () => {
    assert.ok(hasEdge('HomePage', 'calls', 'api.profile.getFirstName'))
    assert.ok(hasEdge('api.profile.getFirstName', 'http', 'GET /api/firstname'))
    assert.ok(hasEdge('GET /api/firstname', 'reads', 'Profile.FirstName'))
    assert.ok(hasEdge('Profile.FirstName', 'maps-to', 'profiles.first_name'))
    assert.ok(hasEdge('Profile', 'maps-to', 'profiles'))
  })

  it('links services, DI and migrations', () => {
    assert.ok(hasEdge('GET /api/auth/me', 'injects', 'AdminSessionService'))
    assert.ok(hasEdge('AdminSessionService', 'injects', 'PortfolioDbContext'))
    assert.ok(hasEdge('AdminSessionService', 'writes', 'Profile.SessionTokenHash'))
    assert.ok(hasEdge('AdminSession', 'migrates', 'profiles.session_token_hash'))
    assert.ok(hasEdge('appsettings.json', 'configures', 'AdminOptions'))
  })

  it('tags tests and links them to what they cover', () => {
    assert.equal(graph.nodes.find((n) => n.label === 'GetFirstNameTests')?.role, 'test/unit')
    assert.equal(graph.nodes.find((n) => n.label === 'AuthEndpointTests')?.role, 'test/integration')
    assert.equal(graph.nodes.find((n) => n.label === 'PortfolioApiFactory')?.role, 'test/support')
    assert.equal(graph.nodes.find((n) => n.label === 'admin.spec.ts')?.role, 'test/e2e')
    assert.ok(hasEdge('GetFirstNameTests', 'tests', 'GET /api/firstname'))
    assert.ok(hasEdge('FirstNameEndpointTests', 'tests', 'GET /api/firstname'))
    assert.ok(hasEdge('HomePage.test.tsx', 'tests', 'HomePage'))
    assert.ok(hasEdge('server.ts', 'mocks', 'GET /api/firstname'))
  })

  it('resolves every call site (no dangling links)', () => {
    assert.deepEqual(graph.unresolved, [])
  })
})
