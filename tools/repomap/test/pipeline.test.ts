/**
 * End-to-end: runs every plugin against the repository this tool lives in (jechel.dev.2026) and checks
 * the architecture facts we care about. Skipped when the .NET SDK is not installed.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { before, describe, it } from 'node:test'
import { buildGraph } from '../src/core/build.ts'
import { loadConfig, TOOL_ROOT } from '../src/core/config.ts'
import { readGitHistoryFile } from '../src/core/git-history.ts'
import { createLogger } from '../src/core/log.ts'
import { validateGraph } from '../src/core/validate.ts'
import { checkGitHistory, type GitHistory } from '../src/shared/git-types.ts'
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
  const node = (layer: string, label: string) => {
    const found = graph.nodes.find((n) => n.layer === layer && n.label === label)
    assert.ok(found, `node "${label}" on ${layer}`)
    return found
  }

  let history: GitHistory | undefined

  before(async () => {
    const config = loadConfig(join(TOOL_ROOT, 'repomap.config.json'))
    config.output = join(mkdtempSync(join(tmpdir(), 'repomap-pipeline-')), 'graph.json')
    config.history.github = 'off' // no network in tests
    graph = (await buildGraph(config, { log: createLogger({ quiet: true }) })).graph
    history = readGitHistoryFile(join(dirname(config.output), 'git.json'))
  })

  it('writes the git history next to the graph', () => {
    assert.ok(history, 'git.json exists')
    assert.equal(checkGitHistory(history), null)
    assert.ok(history.commits.length > 0)
    assert.ok(history.repo.head?.commit)
    assert.ok(history.refs.some((r) => r.type === 'branch'))
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

  it('links the chain component → query hook → API call → endpoint → entity → table', () => {
    const page = node('frontend-views', 'AppsPage')
    const edge = (from: string, type: string, to: string) => graph.edges.some((e) => e.from === from && e.type === type && e.to === to)
    assert.ok(edge(page.id, 'uses', node('frontend', 'useListAppCategoriesQuery').id))
    assert.ok(hasEdge('useListAppsQuery', 'calls', 'api.apps.list'))
    assert.ok(hasEdge('api.apps.list', 'http', 'GET /api/apps'))
    assert.ok(hasEdge('GET /api/apps', 'reads', 'AppEntry.CreatedAt'))
    assert.ok(hasEdge('Profile.FirstName', 'maps-to', 'profiles.first_name'))
    assert.ok(hasEdge('Profile', 'maps-to', 'profiles'))
  })

  it('puts the components and the rest of the frontend on their own layers', () => {
    for (const n of graph.nodes.filter((n) => n.file?.startsWith('frontend/src/') && n.kind !== 'route')) {
      const expected = n.file!.endsWith('.tsx') ? 'frontend-views' : 'frontend'
      assert.equal(n.layer, expected, n.id)
    }
    assert.equal(node('frontend', 'useListAppsQuery').kind, 'hook')
    assert.equal(node('frontend', 'authSlice').kind, 'slice')
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
    assert.ok(hasEdge('GetFirstNameTests', 'tests', 'GET /api/firstname'))
    assert.ok(hasEdge('FirstNameEndpointTests', 'tests', 'GET /api/firstname'))
  })

  it('resolves every call site (no dangling links)', () => {
    assert.deepEqual(graph.unresolved, [])
  })
})
