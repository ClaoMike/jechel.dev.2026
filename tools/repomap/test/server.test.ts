/**
 * The HTTP side of `repomap serve`: graph.json, git.json, the source files of the code panel (and
 * everything they must refuse), the static viewer and the live-reload event stream.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { startServer, type ServerHandle } from '../src/core/serve.ts'
import { MAX_SOURCE_BYTES, readSource } from '../src/core/source.ts'
import type { RepoGraph } from '../src/shared/types.ts'

const dir = mkdtempSync(join(tmpdir(), 'repomap-serve-'))
const repo = join(dir, 'repo')
const out = join(dir, 'out')
const dist = join(dir, 'dist')

const graph: RepoGraph = {
  version: 1,
  meta: {
    tool: { name: 'repomap', version: 'test' },
    repo: { name: 'fixture', root: repo },
    generatedAt: '2026-01-01T00:00:00Z',
    layers: [{ id: 'app', label: 'App', color: '#fff' }],
    roles: [],
    kinds: [{ id: 'file', label: 'File', color: '#fff' }],
    edgeTypes: [],
  },
  nodes: ['src/a.ts', 'big.txt', 'blob.bin', 'escape.ts', 'gone.ts', 'src'].map((file) => ({ id: `app:file:${file}`, label: file, kind: 'file', layer: 'app', role: 'production', file })),
  edges: [],
  unresolved: [],
}

before(() => {
  mkdirSync(join(repo, 'src'), { recursive: true })
  writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1\n')
  writeFileSync(join(repo, '.env'), 'SECRET=1\n')
  writeFileSync(join(repo, 'big.txt'), 'x'.repeat(MAX_SOURCE_BYTES + 1))
  writeFileSync(join(repo, 'blob.bin'), Buffer.from([1, 2, 0, 3]))
  writeFileSync(join(dir, 'outside.txt'), 'not yours\n')
  symlinkSync(join(dir, 'outside.txt'), join(repo, 'escape.ts'))
  mkdirSync(out)
  writeFileSync(join(out, 'graph.json'), JSON.stringify(graph))
  writeFileSync(join(out, 'git.json'), JSON.stringify({ kind: 'repomap-git', version: 1 }))
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>viewer</title>')
  writeFileSync(join(dist, 'assets', 'app-123.js'), 'console.log(1)')
})

describe('source files for the code panel', () => {
  const read = (path: string | null) => readSource(repo, graph, path)

  it('serves text files that are part of the graph', () => {
    const text = (path: string) => {
      const result = read(path)
      return result.ok ? result.text : `${result.status}`
    }
    assert.equal(text('src/a.ts'), 'export const a = 1\n')
    assert.equal(text('./src/../src/a.ts'), 'export const a = 1\n', 'normalised first')
  })

  it('refuses everything else', () => {
    const status = (path: string | null) => {
      const result = read(path)
      return result.ok ? 200 : result.status
    }
    assert.equal(status(null), 400)
    assert.equal(status('.env'), 404, 'not in the graph')
    assert.equal(status('../outside.txt'), 403)
    assert.equal(status('src/../../outside.txt'), 403)
    assert.equal(status('/etc/passwd'), 403)
    assert.equal(status('..\\outside.txt'), 403, 'Windows separators')
    assert.equal(status('escape.ts'), 403, 'a symlink out of the repository')
    assert.equal(status('gone.ts'), 404, 'listed but missing')
    assert.equal(status('src'), 404, 'a folder')
    assert.equal(status('big.txt'), 413)
    assert.equal(status('blob.bin'), 415)
    assert.equal(readSource(repo, undefined, 'src/a.ts').ok, false, 'no graph: nothing is readable')
  })
})

describe('repomap serve', () => {
  let server: ServerHandle
  let url: string

  before(async () => {
    server = await startServer({ graphPath: join(out, 'graph.json'), repoRoot: repo, port: 0, host: '127.0.0.1', distDir: dist, watching: true })
    url = server.url
  })

  after(async () => {
    await server.close()
  })

  it('binds to the given host on a free port', () => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.ok(server.port > 0)
  })

  it('serves graph.json and git.json without caching', async () => {
    const response = await fetch(`${url}/graph.json`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(((await response.json()) as RepoGraph).meta.repo.name, 'fixture')
    const git = await fetch(`${url}/git.json`)
    assert.equal(git.status, 200)
    assert.equal(((await git.json()) as { kind: string }).kind, 'repomap-git')
  })

  it('answers 404 when git.json has not been written', async () => {
    const other = await startServer({ graphPath: join(out, 'graph.json'), gitPath: join(out, 'none.json'), repoRoot: repo, port: 0, host: '127.0.0.1', distDir: dist })
    try {
      const response = await fetch(`${other.url}/git.json`)
      assert.equal(response.status, 404)
    } finally {
      await other.close()
    }
  })

  it('serves source files through the same guard', async () => {
    const ok = await fetch(`${url}/source?path=src/a.ts`)
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), 'export const a = 1\n')
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')
    for (const [path, status] of [
      ['.env', 404],
      ['../outside.txt', 403],
      ['escape.ts', 403],
      ['%2e%2e%2foutside.txt', 403],
    ] as const) {
      assert.equal((await fetch(`${url}/source?path=${path}`)).status, status, path)
    }
    assert.equal((await fetch(`${url}/source`)).status, 400)
  })

  it('serves the viewer, with the app for unknown paths', async () => {
    const index = await fetch(`${url}/`)
    assert.equal(index.status, 200)
    assert.match(await index.text(), /<title>viewer<\/title>/)
    const asset = await fetch(`${url}/assets/app-123.js`)
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get('cache-control') ?? '', /immutable/)
    assert.match(asset.headers.get('content-type') ?? '', /javascript/)
    const deep = await fetch(`${url}/some/deep/link`)
    assert.match(await deep.text(), /<title>viewer<\/title>/)
  })

  it('never serves files outside the viewer folder', async () => {
    for (const path of ['/..%2f..%2fout%2fgraph.json', '/%2e%2e/%2e%2e/outside.txt', '/..\\..\\outside.txt']) {
      const response = await fetch(`${url}${path}`)
      const text = await response.text()
      assert.ok(!text.includes('not yours') && !text.includes('"fixture"'), `${path} stays inside dist`)
    }
    assert.equal((await fetch(`${url}/%E0%A4%A`)).status, 400, 'malformed escapes')
  })

  it('only answers GET and HEAD', async () => {
    assert.equal((await fetch(`${url}/graph.json`, { method: 'POST' })).status, 405)
    assert.equal((await fetch(`${url}/graph.json`, { method: 'HEAD' })).status, 200)
  })

  it('pushes rebuild events to the browser', async () => {
    const text = await new Promise<string>((resolveText, reject) => {
      let received = ''
      let sent = false
      const request = get(`${url}/events`, (response) => {
        assert.match(response.headers['content-type'] ?? '', /text\/event-stream/)
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          received += chunk
          if (!sent && received.includes('event: hello')) {
            sent = true
            server.broadcast('git', { at: 1 })
          }
          if (received.includes('event: git')) {
            request.destroy()
            resolveText(received)
          }
        })
      })
      request.on('error', (error) => {
        if (!received.includes('event: git')) reject(error)
      })
    })
    assert.match(text, /event: hello\ndata: \{"watch":true\}/)
    assert.match(text, /event: git\ndata: \{"at":1\}/)
  })
})
