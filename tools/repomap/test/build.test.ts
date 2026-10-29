/**
 * The build as a whole, with small fake plugins: a working extractor and linker, and plugins that
 * crash, print garbage, break the schema or hang. The build must survive all of them, cache what
 * it can, and write graph.json, git.json and the history of builds. Also: the CLI's commands.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, describe, it } from 'node:test'
import { buildGraph, readGraph, type BuildResult } from '../src/core/build.ts'
import { loadConfig, TOOL_ROOT, type RepoMapConfig } from '../src/core/config.ts'
import { readGitHistoryFile } from '../src/core/git-history.ts'
import { createLogger } from '../src/core/log.ts'
import { validateGraph } from '../src/core/validate.ts'

const dir = mkdtempSync(join(tmpdir(), 'repomap-build-'))
const repo = join(dir, 'repo')
const plugins = join(dir, 'plugins')
const out = join(dir, 'out')
const runs = join(dir, 'runs.log')
const log = createLogger({ quiet: true })
writeFileSync(join(dir, 'gitconfig'), '')
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: join(dir, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'a@x', GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'a@x' }
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env: gitEnv, stdio: 'ignore' })

const PLUGINS: Record<string, string> = {
  // One node per file; appends to runs.log so the test can tell cache hits from runs.
  'good.mjs': `
    import { appendFileSync, readFileSync } from 'node:fs'
    const request = JSON.parse(readFileSync(0, 'utf8'))
    appendFileSync(${JSON.stringify(runs)}, 'run\\n')
    const nodes = request.files.map((f) => ({ id: 'app:file:' + f.path, label: f.path.split('/').pop(), kind: 'file', file: f.path }))
    process.stdout.write(JSON.stringify({ protocol: 1, nodes }))
  `,
  'link.mjs': `
    import { readFileSync } from 'node:fs'
    const { graph } = JSON.parse(readFileSync(0, 'utf8'))
    const [a, b] = graph.nodes.map((n) => n.id).sort()
    process.stdout.write(JSON.stringify({ protocol: 1, edges: a && b ? [{ from: a, to: b, type: 'uses', confidence: 0.8 }] : [] }))
  `,
  'crash.mjs': `process.stderr.write('something broke\\n'); process.exit(3)`,
  'garbage.mjs': `process.stdout.write('this is not json')`,
  'invalid.mjs': `process.stdout.write(JSON.stringify({ protocol: 1, nodes: [{ label: 'no id' }] }))`,
  'slow.mjs': `setTimeout(() => process.stdout.write('{"protocol":1}'), 20000)`,
}

function config(): RepoMapConfig {
  const path = join(dir, 'repomap.config.json')
  const plugin = (id: string, file: string, kind = 'extractor', extra: object = {}) => ({ id, kind, command: ['node', join(plugins, file)], ...extra })
  writeFileSync(
    path,
    JSON.stringify({
      name: 'fixture',
      repoRoot: repo,
      output: join(out, 'graph.json'),
      layers: [{ id: 'app', label: 'App', color: '#38bdf8' }],
      layerRules: [{ match: ['**/*'], layer: 'app' }],
      roles: [{ id: 'production', label: 'Production', color: '#FFF' }],
      kinds: [{ id: 'file', label: 'File', color: '#94a3b8' }],
      edgeTypes: [{ id: 'uses', label: 'Uses', color: '#abc', flow: true }],
      history: { github: 'off' },
      plugins: [
        plugin('good', 'good.mjs'),
        plugin('crash', 'crash.mjs'),
        plugin('garbage', 'garbage.mjs'),
        plugin('invalid', 'invalid.mjs'),
        plugin('slow', 'slow.mjs', 'extractor', { timeoutMs: 1500 }),
        plugin('missing-tool', 'good.mjs', 'extractor', { requires: ['repomap-no-such-executable'] }),
        plugin('link', 'link.mjs', 'linker'),
      ],
    }),
  )
  return loadConfig(path)
}

const runCount = () => (existsSync(runs) ? readFileSync(runs, 'utf8').trim().split('\n').length : 0)

describe('building a repository with misbehaving plugins', () => {
  let first: BuildResult

  before(async () => {
    mkdirSync(join(repo, 'src'), { recursive: true })
    mkdirSync(plugins)
    for (const [name, code] of Object.entries(PLUGINS)) writeFileSync(join(plugins, name), code)
    writeFileSync(join(repo, 'src/a.txt'), 'a\n')
    writeFileSync(join(repo, 'src/b.txt'), 'b\n')
    git('init', '-q', '-b', 'main')
    git('add', '-A')
    git('commit', '-q', '-m', 'First')
    first = await buildGraph(config(), { log })
  })

  it('normalises short colours from the config', () => {
    assert.equal(first.graph.meta.roles.find((r) => r.id === 'production')?.color, '#ffffff')
    assert.equal(first.graph.meta.edgeTypes.find((t) => t.id === 'uses')?.color, '#aabbcc')
  })

  it('keeps what the working plugins found', () => {
    assert.deepEqual(first.graph.nodes.map((n) => n.id).sort(), ['app:file:src/a.txt', 'app:file:src/b.txt'])
    assert.deepEqual(
      first.graph.edges.filter((e) => e.type === 'uses').map((e) => [e.from, e.to, e.confidence]),
      [['app:file:src/a.txt', 'app:file:src/b.txt', 0.8]],
    )
    assert.deepEqual(validateGraph(first.graph), [])
    assert.ok(first.graph.nodes.every((n) => n.layer === 'app' && n.role === 'production'))
  })

  it('reports each failure instead of stopping', () => {
    const info = new Map(first.graph.meta.plugins?.map((p) => [p.id, p]))
    assert.equal(info.get('good')?.error, undefined)
    assert.equal(info.get('good')?.nodes, 2)
    assert.match(info.get('crash')?.error ?? '', /exited with code 3/)
    assert.match(info.get('garbage')?.error ?? '', /did not print valid JSON/)
    assert.ok(info.get('invalid')?.error, 'schema violation reported')
    assert.match(info.get('slow')?.error ?? '', /timed out after 1500 ms/)
    assert.match(info.get('missing-tool')?.error ?? '', /missing repomap-no-such-executable/)
    assert.equal(info.get('link')?.edges, 1)
  })

  it('writes the graph, the git history and a history entry', () => {
    assert.ok(existsSync(join(out, 'graph.json')))
    assert.deepEqual(readGraph(join(out, 'graph.json'))?.nodes.length, 2)
    assert.equal(readGitHistoryFile(join(out, 'git.json'))?.commits[0].subject, 'First')
    assert.equal(first.changed, true)
    assert.equal(first.gitChanged, true)
    assert.equal(readdirSync(join(out, 'history')).length, 1)
    assert.equal(first.graph.meta.repo.root, repo)
    assert.equal(first.graph.meta.repo.branch, 'main')
  })

  it('answers from the cache when nothing changed', async () => {
    const before = runCount()
    const again = await buildGraph(config(), { log })
    assert.equal(runCount(), before, 'the extractor did not run')
    assert.equal(again.graph.meta.plugins?.find((p) => p.id === 'good')?.cached, true)
    assert.equal(again.changed, false)
    assert.equal(again.gitChanged, false)
    assert.equal(readdirSync(join(out, 'history')).length, 1, 'unchanged builds are not kept')
  })

  it('runs again when a file changes, and records what changed', async () => {
    const before = runCount()
    writeFileSync(join(repo, 'src/c.txt'), 'c\n')
    const next = await buildGraph(config(), { log })
    assert.equal(runCount(), before + 1)
    assert.equal(next.changed, true)
    assert.deepEqual(next.graph.meta.changes?.addedNodes, ['app:file:src/c.txt'])
    assert.equal(next.gitChanged, true, 'the working tree changed too')
  })

  it('re-runs everything with --no-cache', async () => {
    const before = runCount()
    await buildGraph(config(), { log, noCache: true })
    assert.equal(runCount(), before + 1)
  })

  it('leaves private details out of public builds', async () => {
    const published = await buildGraph(config(), { log, publicOutput: true })
    assert.equal(published.graph.meta.repo.root, undefined)
    assert.equal(readGitHistoryFile(join(out, 'git.json'))?.workingTree, undefined)
  })
})

describe('the command line', () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, [join(TOOL_ROOT, 'src/cli.ts'), ...args], { cwd: TOOL_ROOT, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })
  const graphFile = join(out, 'cli-graph.json')

  before(() => {
    const graph = readGraph(join(out, 'graph.json'))!
    writeFileSync(graphFile, JSON.stringify(graph))
  })

  it('prints help and rejects unknown commands', () => {
    const help = cli('help')
    assert.equal(help.status, 0)
    assert.match(help.stdout, /Commands/)
    const unknown = cli('frobnicate')
    assert.equal(unknown.status, 1)
    assert.match(unknown.stderr, /unknown command "frobnicate"/)
  })

  it('validates a graph and explains what is wrong with a broken one', () => {
    const ok = cli('validate', graphFile)
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stderr, /is valid \(\d+ nodes, \d+ edges\)/)
    const broken = JSON.parse(readFileSync(graphFile, 'utf8'))
    broken.edges.push({ from: 'app:file:src/a.txt', to: 'app:file:nowhere', type: 'uses', source: 'static', confidence: 1 })
    broken.nodes[0].kind = 'no-such-kind'
    const brokenFile = join(out, 'broken.json')
    writeFileSync(brokenFile, JSON.stringify(broken))
    const bad = cli('validate', brokenFile)
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /no-such-kind/)
    assert.match(bad.stderr, /nowhere/)
    assert.equal(cli('validate', join(out, 'missing.json')).status, 1)
  })

  it('validates a git.json too', () => {
    const ok = cli('validate', join(out, 'git.json'))
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stderr, /is valid \(\d+ commits, \d+ refs\)/)
    const history = JSON.parse(readFileSync(join(out, 'git.json'), 'utf8'))
    history.refs.push({ name: 'ghost', type: 'branch', commit: 'deadbee' })
    writeFileSync(join(out, 'broken.git.json'), JSON.stringify(history))
    const bad = cli('validate', join(out, 'broken.git.json'))
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /branch ghost points at unknown commit deadbee/)
  })

  it('diffs two graphs', () => {
    const after = JSON.parse(readFileSync(graphFile, 'utf8'))
    after.nodes = after.nodes.filter((n: { id: string }) => n.id !== 'app:file:src/b.txt')
    after.edges = after.edges.filter((e: { to: string; from: string }) => e.to !== 'app:file:src/b.txt' && e.from !== 'app:file:src/b.txt')
    after.nodes[0].label = 'renamed'
    const afterFile = join(out, 'after.json')
    writeFileSync(afterFile, JSON.stringify(after))
    const diff = cli('diff', graphFile, afterFile)
    assert.equal(diff.status, 0)
    assert.match(diff.stdout, /- nodes \(1\)\n {2}app:file:src\/b\.txt/)
    assert.match(diff.stdout, /~ nodes \(1\)/)
    assert.match(cli('diff', graphFile, graphFile).stdout, /No structural differences/)
  })
})
