import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { loadConfig, mergeConfig, parseJsonc, TOOL_ROOT } from '../src/core/config.ts'
import { classifyFiles } from '../src/core/files.ts'
import { GraphAssembler } from '../src/core/merge.ts'
import type { FileEntry } from '../src/shared/types.ts'

describe('config', () => {
  it('parses JSON with comments and trailing commas', () => {
    assert.deepEqual(parseJsonc('{\n // a comment\n "a": "x // not a comment", /* block */ "b": [1, 2,],\n}'), { a: 'x // not a comment', b: [1, 2] })
  })

  it('merges id arrays by id, prepends rules, replaces the rest', () => {
    const parent = { layers: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], roleRules: [{ match: ['x'], role: 'p' }], name: 'parent' }
    const child = { layers: [{ id: 'b', label: 'B2' }, { id: 'c', label: 'C' }], roleRules: [{ match: ['y'], role: 'c' }], name: 'child' }
    const merged = mergeConfig(parent, child)
    assert.deepEqual(merged.layers, [{ id: 'a', label: 'A' }, { id: 'b', label: 'B2' }, { id: 'c', label: 'C' }])
    assert.deepEqual((merged.roleRules as { role: string }[]).map((r) => r.role), ['c', 'p'])
    assert.equal(merged.name, 'child')
  })

  it('puts a new entry with "before" in front of that entry', () => {
    const parent = { layers: [{ id: 'frontend', label: 'F' }, { id: 'backend', label: 'B' }] }
    const child = { layers: [{ id: 'views', label: 'V', before: 'frontend' }, { id: 'frontend', label: 'Model' }, { id: 'infra', label: 'I', before: 'nowhere' }] }
    assert.deepEqual(mergeConfig(parent, child).layers, [{ id: 'views', label: 'V' }, { id: 'frontend', label: 'Model' }, { id: 'backend', label: 'B' }, { id: 'infra', label: 'I' }])
  })

  it('rejects colours the viewer cannot use', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repomap-colors-'))
    const path = join(dir, 'repomap.config.json')
    writeFileSync(path, JSON.stringify({ layers: [{ id: 'app', label: 'App', color: 'blue' }] }))
    assert.throws(() => loadConfig(path), /layer "app": color must look like #1e90ff \(got "blue"\)/)
  })

  it('loads the stack preset through extends', () => {
    const config = loadConfig(join(TOOL_ROOT, 'repomap.config.json'))
    assert.deepEqual(config.layers.map((l) => l.id), ['frontend-views', 'frontend', 'backend', 'database', 'infra'])
    assert.deepEqual(config.layers.filter((l) => l.arrange === 'tree').map((l) => l.id), ['frontend-views', 'frontend'])
    assert.ok(config.layers.every((l) => !('before' in l)), 'placement hints are not part of the vocabulary')
    assert.deepEqual(config.plugins.find((p) => p.id === 'typescript')?.layers, ['frontend-views', 'frontend'])
    assert.ok(config.plugins.some((p) => p.id === 'typescript'))
    assert.ok(config.exclude.includes('tools/repomap/**'))
  })
})

describe('file classification', () => {
  const root = mkdtempSync(join(tmpdir(), 'repomap-test-'))
  const files: Record<string, string> = {
    'web/package.json': '{ "dependencies": { "react": "^19" } }',
    'web/src/App.tsx': '',
    'web/src/App.test.tsx': '',
    'web/src/test/server.ts': '',
    'web/e2e/home.spec.ts': '',
    'web/vite.config.ts': '',
    'api/src/Api/Api.csproj': '<Project />',
    'api/src/Api/Program.cs': '',
    'api/src/Api/Data/Migrations/20260101_Init.cs': '',
    'api/src/Api/Data/Migrations/20260101_Init.Designer.cs': '',
    'api/tests/Api.UnitTests/Api.UnitTests.csproj': '<Project />',
    'api/tests/Api.UnitTests/FooTests.cs': '',
    'api/tests/Api.IntegrationTests/Api.IntegrationTests.csproj': '<Project />',
    'api/tests/Api.IntegrationTests/Factory.cs': '',
    '.github/workflows/ci.yml': '',
    'README.md': '',
    'docker-compose.yml': '',
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const config = { ...loadConfig(join(TOOL_ROOT, 'repomap.config.json')), repoRoot: root }
  const entries = new Map(classifyFiles(Object.keys(files).sort(), config).map((f) => [f.path, f]))
  const expect = (path: string, layer: string, role: string) => {
    const entry = entries.get(path)
    assert.ok(entry, `${path} was classified`)
    assert.equal(entry.layer, layer, `${path} layer`)
    assert.equal(entry.role, role, `${path} role (${entry.roleReason})`)
  }

  it('assigns layers from project markers and globs', () => {
    expect('web/src/App.tsx', 'frontend', 'production')
    expect('api/src/Api/Program.cs', 'backend', 'production')
    expect('api/src/Api/Data/Migrations/20260101_Init.cs', 'database', 'migration')
    expect('README.md', 'infra', 'docs')
  })

  it('detects tests, test support, config, generated code and tooling', () => {
    expect('web/src/App.test.tsx', 'frontend', 'test/unit')
    expect('web/src/test/server.ts', 'frontend', 'test/support')
    expect('web/e2e/home.spec.ts', 'frontend', 'test/e2e')
    expect('web/vite.config.ts', 'frontend', 'config')
    expect('api/tests/Api.UnitTests/FooTests.cs', 'backend', 'test/unit')
    expect('api/tests/Api.IntegrationTests/Factory.cs', 'backend', 'test/integration')
    expect('api/tests/Api.UnitTests/Api.UnitTests.csproj', 'backend', 'config')
    expect('api/src/Api/Data/Migrations/20260101_Init.Designer.cs', 'database', 'generated')
    expect('.github/workflows/ci.yml', 'infra', 'tooling')
    expect('docker-compose.yml', 'infra', 'config')
  })
})

describe('GraphAssembler', () => {
  const files = new Map<string, FileEntry>([
    ['src/a.ts', { path: 'src/a.ts', layer: 'frontend', role: 'production', roleReason: 'default' }],
    ['src/a.test.ts', { path: 'src/a.test.ts', layer: 'frontend', role: 'test/unit', roleReason: 'naming' }],
  ])

  it('fills layer/role from the file, merges duplicates and derives contains edges', () => {
    const assembler = new GraphAssembler(files, { layer: 'infra', role: 'production' })
    assembler.addOutput('one', {
      protocol: 1,
      nodes: [
        { id: 'frontend:symbol:src/a.ts#A', label: 'A', kind: 'component', file: 'src/a.ts', tags: ['x'] },
        { id: 'frontend:symbol:src/a.ts#B', label: 'B', kind: 'hook', file: 'src/a.ts', parent: 'frontend:symbol:src/a.ts#A' },
      ],
    })
    assembler.addOutput('two', { protocol: 1, nodes: [{ id: 'frontend:symbol:src/a.ts#A', label: 'ignored', kind: 'component', tags: ['y'], description: 'filled in' }] })
    const { nodes, edges } = assembler.finalize()
    const a = nodes.find((n) => n.label === 'A')!
    assert.equal(a.layer, 'frontend')
    assert.equal(a.role, 'production')
    assert.deepEqual(a.tags, ['x', 'y'])
    assert.equal(a.description, 'filled in')
    assert.ok(edges.some((e) => e.type === 'contains' && e.from === a.id))
  })

  it('moves edges to unknown nodes to unresolved and resolves file references', () => {
    const assembler = new GraphAssembler(files, { layer: 'infra', role: 'production' })
    assembler.addOutput('one', {
      protocol: 1,
      nodes: [
        { id: 'frontend:file:src/a.test.ts', label: 'a.test.ts', kind: 'test-suite', file: 'src/a.test.ts' },
        { id: 'frontend:symbol:src/a.ts#A', label: 'A', kind: 'component', file: 'src/a.ts', line: 3 },
      ],
      edges: [{ from: 'frontend:file:src/a.test.ts', to: 'backend:route:GET /missing', type: 'tests' }],
      facts: [{ type: 'file-ref', from: 'frontend:file:src/a.test.ts', edgeType: 'uses', path: 'src/a.ts' }],
    })
    assembler.resolveFileRefs()
    const { nodes, edges, unresolved } = assembler.finalize()
    assert.equal(nodes.find((n) => n.label === 'a.test.ts')!.role, 'test/unit')
    assert.deepEqual(unresolved.map((u) => u.target), ['backend:route:GET /missing'])
    assert.ok(edges.some((e) => e.type === 'uses' && e.to === 'frontend:symbol:src/a.ts#A'))
  })
})
