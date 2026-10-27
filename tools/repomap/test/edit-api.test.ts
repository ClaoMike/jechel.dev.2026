/**
 * The writing side of `repomap serve`: saving files from the code panel (through the same guard as
 * reading, with ETags against lost updates) and running git commands, and every request that must be
 * refused: other sites, other hosts, a read-only server.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { startServer, type ServerHandle } from '../src/core/serve.ts'
import { etagOf, MAX_SOURCE_BYTES, readSource, writeSource } from '../src/core/source.ts'
import { WRITE_HEADER, type GitActionResult, type GitLiveState } from '../src/shared/git-actions.ts'
import type { RepoGraph } from '../src/shared/types.ts'

const dir = mkdtempSync(join(tmpdir(), 'repomap-edit-'))
writeFileSync(join(dir, 'gitconfig'), '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n')
process.env.GIT_CONFIG_GLOBAL = join(dir, 'gitconfig')
process.env.GIT_CONFIG_NOSYSTEM = '1'
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
    kinds: [{ id: 'file', label: 'File', color: '#fff', shape: 'box' }],
    edgeTypes: [],
    presets: [],
    layout: { algorithm: 'test', layerGap: 90, seed: 1 },
  },
  nodes: ['src/a.ts', 'src/crlf.ts', 'blob.bin', 'escape.ts', 'gone.ts'].map((file) => ({ id: `app:file:${file}`, label: file, kind: 'file', layer: 'app', role: 'production', file })),
  edges: [],
  unresolved: [],
}

const sh = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
const fileText = (path: string) => readFileSync(join(repo, path), 'utf8')

before(() => {
  mkdirSync(join(repo, 'src'), { recursive: true })
  writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1\n')
  writeFileSync(join(repo, 'src/crlf.ts'), 'one\r\ntwo\r\n')
  writeFileSync(join(repo, '.env'), 'SECRET=1\n')
  writeFileSync(join(repo, '.gitignore'), '.env\n')
  writeFileSync(join(repo, 'blob.bin'), Buffer.from([1, 2, 0, 3]))
  writeFileSync(join(dir, 'outside.txt'), 'not yours\n')
  symlinkSync(join(dir, 'outside.txt'), join(repo, 'escape.ts'))
  sh('init', '--quiet')
  // Like a real project: .env is ignored (so even a writable server never serves it).
  sh('add', 'src', '.gitignore', 'blob.bin')
  sh('commit', '--quiet', '-m', 'Initial commit')
  mkdirSync(out)
  writeFileSync(join(out, 'graph.json'), JSON.stringify(graph))
  mkdirSync(dist)
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>viewer</title>')
})

describe('saving source files', () => {
  it('writes files of the graph, and only those', () => {
    const loaded = readSource(repo, graph, 'src/a.ts')
    assert.ok(loaded.ok)
    const saved = writeSource(repo, graph, 'src/a.ts', 'export const a = 2\n', loaded.etag)
    assert.ok(saved.ok)
    assert.equal(fileText('src/a.ts'), 'export const a = 2\n')
    assert.equal(saved.etag, etagOf('export const a = 2\n'))
    const status = (path: string, text = 'x') => {
      const result = writeSource(repo, graph, path, text)
      return result.ok ? 200 : result.status
    }
    assert.equal(status('.env'), 404, 'not in the graph')
    assert.equal(fileText('.env'), 'SECRET=1\n')
    assert.equal(status('../outside.txt'), 403)
    assert.equal(status('escape.ts'), 403, 'a symlink out of the repository')
    assert.equal(readFileSync(join(dir, 'outside.txt'), 'utf8'), 'not yours\n')
    assert.equal(status('gone.ts'), 404, 'never creates files')
    assert.equal(status('blob.bin'), 415, 'never overwrites binary files')
    assert.equal(status('src/a.ts', 'x'.repeat(MAX_SOURCE_BYTES + 1)), 413)
    assert.equal(status('src/a.ts', 'a\0b'), 415)
    assert.equal(writeSource(repo, undefined, 'src/a.ts', 'x').ok, false, 'no graph: nothing is writable')
  })

  it('refuses to overwrite a file that changed since it was opened', () => {
    const loaded = readSource(repo, graph, 'src/a.ts')
    assert.ok(loaded.ok)
    writeFileSync(join(repo, 'src/a.ts'), 'changed in another editor\n')
    const result = writeSource(repo, graph, 'src/a.ts', 'mine\n', loaded.etag)
    assert.ok(!result.ok)
    assert.equal(result.status, 412)
    assert.equal(result.etag, etagOf('changed in another editor\n'), 'tells the current version')
    assert.equal(fileText('src/a.ts'), 'changed in another editor\n')
    assert.ok(writeSource(repo, graph, 'src/a.ts', 'mine\n', '*').ok, 'If-Match: * overwrites')
    assert.equal(fileText('src/a.ts'), 'mine\n')
  })

  it('keeps the bytes it is given (line endings included)', () => {
    const saved = writeSource(repo, graph, 'src/crlf.ts', 'one\r\ntwo\r\nthree\r\n')
    assert.ok(saved.ok)
    assert.equal(fileText('src/crlf.ts'), 'one\r\ntwo\r\nthree\r\n')
  })
})

interface Reply {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

/** A raw HTTP request (fetch can't set Host or Origin freely). */
function send(base: string, method: string, path: string, options: { body?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  const url = new URL(path, base)
  return new Promise((resolveReply, reject) => {
    const req = httpRequest(url, { method, headers: options.headers }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => resolveReply({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end(options.body)
  })
}

const WRITE = { [WRITE_HEADER]: '1' }
const JSON_WRITE = { ...WRITE, 'Content-Type': 'application/json' }

describe('the editing API', () => {
  let server: ServerHandle
  let readOnly: ServerHandle
  let gitChanges = 0
  const saved: string[] = []

  before(async () => {
    const common = { graphPath: join(out, 'graph.json'), repoRoot: repo, port: 0, host: '127.0.0.1', distDir: dist }
    server = await startServer({
      ...common,
      writable: true,
      onSaved: (path) => saved.push(path),
      onGitChanged: async () => {
        gitChanges++
      },
    })
    readOnly = await startServer(common)
  })

  after(async () => {
    await server.close()
    await readOnly.close()
  })

  it('tells the code panel whether it may save, with the ETag to send back', async () => {
    writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1\n')
    const writable = await send(server.url, 'GET', '/source?path=src/a.ts')
    assert.equal(writable.headers['x-repomap-writable'], '1')
    assert.equal(writable.headers.etag, etagOf('export const a = 1\n'))
    const locked = await send(readOnly.url, 'GET', '/source?path=src/a.ts')
    assert.equal(locked.status, 200)
    assert.equal(locked.headers['x-repomap-writable'], '0')
  })

  it('saves a file with PUT /source and If-Match', async () => {
    writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1\n')
    const etag = etagOf('export const a = 1\n')
    const put = await send(server.url, 'PUT', '/source?path=src/a.ts', { body: 'export const a = 3\n', headers: { ...WRITE, 'If-Match': etag, 'Content-Type': 'text/plain' } })
    assert.equal(put.status, 204)
    assert.equal(put.headers.etag, etagOf('export const a = 3\n'))
    assert.equal(fileText('src/a.ts'), 'export const a = 3\n')
    assert.deepEqual(saved.slice(-1), ['src/a.ts'])

    const stale = await send(server.url, 'PUT', '/source?path=src/a.ts', { body: 'lost update\n', headers: { ...WRITE, 'If-Match': etag } })
    assert.equal(stale.status, 412)
    assert.equal(stale.headers.etag, etagOf('export const a = 3\n'))
    assert.equal(fileText('src/a.ts'), 'export const a = 3\n')

    const secret = await send(server.url, 'PUT', '/source?path=.env', { body: 'x', headers: WRITE })
    assert.equal(secret.status, 404, 'ignored by git: never served')
    assert.equal((await send(server.url, 'GET', '/source?path=.env')).status, 404)
    assert.equal(readFileSync(join(repo, '.env'), 'utf8'), 'SECRET=1\n')
    const traversal = await send(server.url, 'PUT', `/source?path=${encodeURIComponent('../outside.txt')}`, { body: 'x', headers: WRITE })
    assert.equal(traversal.status, 403)
    const huge = await send(server.url, 'PUT', '/source?path=src/a.ts', { body: 'x'.repeat(MAX_SOURCE_BYTES + 10), headers: WRITE })
    assert.equal(huge.status, 413)
    assert.equal(fileText('src/a.ts'), 'export const a = 3\n')
  })

  it('refuses writes from other sites, other hosts, or without the header', async () => {
    const put = (headers: Record<string, string>) => send(server.url, 'PUT', '/source?path=src/a.ts', { body: 'pwned\n', headers })
    const port = server.port
    assert.equal((await put({})).status, 403, 'no X-Repomap-Request header')
    assert.equal((await put({ ...WRITE, Origin: 'https://evil.example' })).status, 403, 'another site')
    assert.equal((await put({ ...WRITE, Origin: `http://localhost:${port + 1}` })).status, 403, 'another local port')
    assert.equal((await put({ ...WRITE, Host: `evil.example:${port}` })).status, 403, 'DNS rebinding')
    assert.equal((await put({ ...WRITE, Host: `192.168.1.5:${port}` })).status, 403, 'a LAN address')
    assert.equal((await put({ ...WRITE, Origin: `http://127.0.0.1:${port}` })).status, 204, 'the viewer itself')
    assert.equal(fileText('src/a.ts'), 'pwned\n')
    writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1\n')
    const git = await send(server.url, 'POST', '/api/git', { body: '{"type":"fetch"}', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', ...WRITE } })
    assert.equal(git.status, 403)
    const preflight = await send(server.url, 'OPTIONS', '/api/git', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } })
    assert.equal(preflight.headers['access-control-allow-origin'], undefined, 'no CORS, ever')
  })

  it('says whether it is writable', async () => {
    assert.deepEqual(JSON.parse((await send(server.url, 'GET', '/api/info')).body), { writable: true, ai: false, boardAi: false })
    const locked = await send(readOnly.url, 'GET', '/api/info')
    assert.equal(locked.status, 200)
    assert.deepEqual(JSON.parse(locked.body), { writable: false })
  })

  it('serves source to localhost only, once it is writable (no DNS rebinding)', async () => {
    const rebound = await send(server.url, 'GET', '/source?path=src/a.ts', { headers: { Host: `evil.example:${server.port}` } })
    assert.equal(rebound.status, 403)
    const readOnlyLan = await send(readOnly.url, 'GET', '/source?path=src/a.ts', { headers: { Host: `192.168.1.5:${readOnly.port}` } })
    assert.equal(readOnlyLan.status, 200, 'a read-only server may be opened from a phone on the LAN')
  })

  it('is read-only unless enabled', async () => {
    const put = await send(readOnly.url, 'PUT', '/source?path=src/a.ts', { body: 'x', headers: WRITE })
    assert.equal(put.status, 405)
    const git = await send(readOnly.url, 'POST', '/api/git', { body: '{"type":"fetch"}', headers: JSON_WRITE })
    assert.equal(git.status, 405)
    const state = await send(readOnly.url, 'GET', '/api/git/state')
    assert.equal(state.status, 404)
    assert.equal(fileText('src/a.ts'), 'export const a = 1\n')
  })

  it('reports the live git state', async () => {
    const reply = await send(server.url, 'GET', '/api/git/state')
    assert.equal(reply.status, 200)
    const state = JSON.parse(reply.body) as GitLiveState
    assert.equal(state.branch, 'main')
    assert.deepEqual(state.files.map((f) => `${f.x}${f.y} ${f.path}`), ['.M src/crlf.ts', '?? escape.ts'])
  })

  it('runs git commands and re-reads the history afterwards', async () => {
    const before = gitChanges
    const reply = await send(server.url, 'POST', '/api/git', { body: JSON.stringify({ type: 'commit', summary: 'From the viewer', files: ['src/crlf.ts'] }), headers: JSON_WRITE })
    assert.equal(reply.status, 200)
    const result = JSON.parse(reply.body) as GitActionResult
    assert.ok(result.ok)
    assert.equal(result.message, 'Committed 1 file to main')
    assert.equal(sh('log', '-1', '--format=%s'), 'From the viewer')
    assert.equal(gitChanges, before + 1)
    assert.deepEqual(result.state.files.map((f) => f.path), ['escape.ts'])
  })

  it('answers bad requests without running git', async () => {
    const post = (body: string, headers: Record<string, string> = JSON_WRITE) => send(server.url, 'POST', '/api/git', { body, headers })
    assert.equal((await post('not json')).status, 400)
    assert.equal((await post('{"summary":"no type"}')).status, 400)
    assert.equal((await post('{"type":"fetch"}', WRITE)).status, 415, 'JSON only')
    const unknown = await post('{"type":"rm-rf"}')
    assert.equal(unknown.status, 400)
    assert.match(unknown.body, /Unknown action/)
    const injection = await post(JSON.stringify({ type: 'create-branch', name: '--help', checkout: false }))
    assert.equal(injection.status, 400)
    const failed = await post(JSON.stringify({ type: 'checkout', ref: 'nope', target: 'branch' }))
    assert.equal(failed.status, 400)
    assert.match(JSON.parse(failed.body).error, /no branch nope/)
    assert.equal((await send(server.url, 'GET', '/api/unknown')).status, 404)
  })

  it('reports git failures as results, not server errors', async () => {
    const reply = await send(server.url, 'POST', '/api/git', { body: '{"type":"fetch"}', headers: JSON_WRITE })
    assert.equal(reply.status, 400, 'no remote: refused up front')
    assert.match(JSON.parse(reply.body).error, /no remote/)
  })
})
