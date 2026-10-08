/**
 * Creating, deleting and renaming files and folders from the viewer: what works, everything that is
 * refused (outside the repository, .git, symlinks out, overwrites), the endpoints and their guard,
 * and the layer/role preview of a new file.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { startServer, type ServerHandle } from '../src/core/serve.ts'
import { readSource } from '../src/core/source.ts'
import { applyFileOperation, checkPath, forgetWorkspace, workspaceFiles, WorkspaceError, type FileOperation } from '../src/core/workspace.ts'
import { WRITE_HEADER } from '../src/shared/git-actions.ts'
import type { RepoGraph } from '../src/shared/types.ts'

const sandbox = mkdtempSync(join(tmpdir(), 'repomap-workspace-'))
writeFileSync(join(sandbox, 'gitconfig'), '[user]\n\tname = Test\n\temail = test@example.com\n')
process.env.GIT_CONFIG_GLOBAL = join(sandbox, 'gitconfig')
process.env.GIT_CONFIG_NOSYSTEM = '1'
writeFileSync(join(sandbox, 'outside.txt'), 'not yours\n')
mkdirSync(join(sandbox, 'elsewhere'))

let repo: string
let n = 0
function freshRepo(): string {
  const dir = join(sandbox, `repo-${n++}`)
  mkdirSync(join(dir, 'src', 'deep'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.ts'), 'a\n')
  writeFileSync(join(dir, 'src', 'deep', 'b.ts'), 'b\n')
  writeFileSync(join(dir, '.gitignore'), '.env\n')
  writeFileSync(join(dir, '.env'), 'SECRET=1\n')
  symlinkSync(join(sandbox, 'elsewhere'), join(dir, 'link-out'))
  execFileSync('git', ['init', '--quiet'], { cwd: dir })
  return dir
}

const apply = (operation: FileOperation) => applyFileOperation(repo, operation)
const refused = (operation: FileOperation, status: number, pattern?: RegExp) =>
  assert.throws(() => apply(operation), (error: Error) => error instanceof WorkspaceError && error.status === status && (!pattern || pattern.test(error.message)))

describe('file operations', () => {
  beforeEach(() => {
    repo = freshRepo()
  })

  it('creates files, with their folders, and never overwrites', () => {
    assert.deepEqual(apply({ op: 'create', path: 'web/src/new/Card.tsx', content: 'export {}\n' }), { message: 'Created web/src/new/Card.tsx', path: 'web/src/new/Card.tsx' })
    assert.equal(readFileSync(join(repo, 'web/src/new/Card.tsx'), 'utf8'), 'export {}\n')
    apply({ op: 'create', path: 'empty.md' })
    assert.equal(readFileSync(join(repo, 'empty.md'), 'utf8'), '')
    refused({ op: 'create', path: 'src/a.ts', content: 'x' }, 409, /already exists/)
    assert.equal(readFileSync(join(repo, 'src/a.ts'), 'utf8'), 'a\n')
    refused({ op: 'create', path: 'src/a.ts/inner.ts' }, 409, /in the way/)
  })

  it('deletes files and whole folders', () => {
    assert.equal(apply({ op: 'delete', path: 'src/a.ts' }).message, 'Deleted src/a.ts')
    assert.ok(!existsSync(join(repo, 'src/a.ts')))
    const folder = apply({ op: 'delete', path: 'src/' })
    assert.equal(folder.files, 1)
    assert.equal(folder.message, 'Deleted src/ (1 file)')
    assert.ok(!existsSync(join(repo, 'src')))
    refused({ op: 'delete', path: 'src' }, 404)
  })

  it('removes a symlink, never what it points to', () => {
    writeFileSync(join(sandbox, 'elsewhere', 'keep.txt'), 'keep\n')
    apply({ op: 'delete', path: 'link-out' })
    assert.ok(existsSync(join(sandbox, 'elsewhere', 'keep.txt')))
  })

  it('renames and moves files and folders', () => {
    assert.equal(apply({ op: 'rename', from: 'src/a.ts', to: 'lib/a2.ts' }).path, 'lib/a2.ts')
    assert.equal(readFileSync(join(repo, 'lib/a2.ts'), 'utf8'), 'a\n')
    apply({ op: 'rename', from: 'src/deep', to: 'src/shallow' })
    assert.ok(existsSync(join(repo, 'src/shallow/b.ts')))
    writeFileSync(join(repo, 'x.ts'), 'x\n')
    refused({ op: 'rename', from: 'x.ts', to: 'lib/a2.ts' }, 409, /already exists/)
    refused({ op: 'rename', from: 'nope.ts', to: 'y.ts' }, 404)
    refused({ op: 'rename', from: 'src', to: 'src/inside' }, 400, /into itself/)
    refused({ op: 'rename', from: 'x.ts', to: 'x.ts' }, 400)
  })

  it('refuses paths outside the repository, into .git, or through symlinks out', () => {
    for (const path of ['../outside.txt', '/etc/passwd', 'src/../../outside.txt', '..\\outside.txt', 'C:/x']) refused({ op: 'create', path, content: 'x' }, 403)
    refused({ op: 'create', path: '.git/hooks/pre-commit', content: 'evil' }, 403, /\.git/)
    refused({ op: 'create', path: 'src/.GIT/config' }, 403)
    refused({ op: 'delete', path: '.git' }, 403)
    refused({ op: 'rename', from: 'src/a.ts', to: '.git/a.ts' }, 403)
    refused({ op: 'create', path: 'link-out/escaped.txt', content: 'x' }, 403, /leads out/)
    assert.ok(!existsSync(join(sandbox, 'elsewhere', 'escaped.txt')))
    refused({ op: 'rename', from: 'src/a.ts', to: 'link-out/a.ts' }, 403)
    refused({ op: 'delete', path: '.' }, 400)
    refused({ op: 'delete', path: '' }, 400)
    refused({ op: 'create', path: 'a\0b' }, 400)
    refused({ op: 'format' } as unknown as FileOperation, 400, /Unknown operation/)
    assert.equal(readFileSync(join(sandbox, 'outside.txt'), 'utf8'), 'not yours\n')
  })

  it('never deletes a folder that holds another repository', () => {
    mkdirSync(join(repo, 'vendor/lib'), { recursive: true })
    execFileSync('git', ['init', '--quiet'], { cwd: join(repo, 'vendor/lib') })
    refused({ op: 'delete', path: 'vendor/lib' }, 403, /another repository/)
  })

  it('normalises paths', () => {
    assert.equal(checkPath(repo, './src//deep/../a.ts').rel, 'src/a.ts')
    assert.equal(checkPath(repo, 'src\\deep\\b.ts').rel, 'src/deep/b.ts')
  })

  it('lists the files git sees, not ignored ones, and opens them on a writable server', () => {
    const { files, set } = workspaceFiles(repo)
    assert.ok(set.has('src/a.ts') && set.has('.gitignore'))
    assert.ok(!files.includes('.env'), '.env is ignored')
    apply({ op: 'create', path: 'new.ts', content: 'n\n' })
    forgetWorkspace(repo)
    const allow = (path: string) => workspaceFiles(repo).set.has(path)
    const text = (path: string) => {
      const result = readSource(repo, undefined, path, allow)
      return result.ok ? result.text : result.status
    }
    assert.equal(text('new.ts'), 'n\n', 'not in any graph yet, but git lists it')
    assert.equal(text('.env'), 404, 'ignored files stay out')
  })
})

function send(base: string, method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolveReply, reject) => {
    const req = httpRequest(new URL(path, base), { method, headers }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (text += chunk))
      res.on('end', () => resolveReply({ status: res.statusCode ?? 0, body: text }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

describe('file endpoints', () => {
  let server: ServerHandle
  let readOnly: ServerHandle
  let changes = 0
  const JSON_WRITE = { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' }

  before(async () => {
    repo = freshRepo()
    const out = join(repo, '..', `out-${n}`)
    mkdirSync(out)
    const graph = { version: 1, meta: { repo: { name: 'x', root: repo }, layers: [], roles: [], kinds: [], edgeTypes: [], presets: [] }, nodes: [], edges: [], unresolved: [] } as unknown as RepoGraph
    writeFileSync(join(out, 'graph.json'), JSON.stringify(graph))
    const common = { graphPath: join(out, 'graph.json'), repoRoot: repo, port: 0, host: '127.0.0.1', distDir: out }
    server = await startServer({
      ...common,
      writable: true,
      onFilesChanged: () => changes++,
      classify: (path) => (path.startsWith('web/') ? { layer: 'frontend', role: path.includes('.test.') ? 'test' : 'production', reason: 'rule' } : undefined),
    })
    readOnly = await startServer(common)
  })

  after(async () => {
    await server.close()
    await readOnly.close()
  })

  it('lists files', async () => {
    const reply = await send(server.url, 'GET', '/api/files')
    const files = (JSON.parse(reply.body) as { files: string[] }).files
    assert.ok(files.includes('src/deep/b.ts'))
    assert.ok(!files.includes('.env'))
  })

  it('creates, renames and deletes, and asks for a rebuild each time', async () => {
    const before = changes
    const created = await send(server.url, 'POST', '/api/files', JSON.stringify({ op: 'create', path: 'web/App.tsx', content: 'x\n' }), JSON_WRITE)
    assert.equal(created.status, 200)
    assert.deepEqual(JSON.parse(created.body), { ok: true, message: 'Created web/App.tsx', path: 'web/App.tsx' })
    // Opens right away in the code panel, before any rebuild.
    assert.equal((await send(server.url, 'GET', '/source?path=web/App.tsx')).body, 'x\n')
    assert.equal((await send(readOnly.url, 'GET', '/source?path=web/App.tsx')).status, 404, 'a read-only server serves graph files only')
    const renamed = await send(server.url, 'POST', '/api/files', JSON.stringify({ op: 'rename', from: 'web/App.tsx', to: 'web/Main.tsx' }), JSON_WRITE)
    assert.equal(JSON.parse(renamed.body).path, 'web/Main.tsx')
    const deleted = await send(server.url, 'POST', '/api/files', JSON.stringify({ op: 'delete', path: 'web' }), JSON_WRITE)
    assert.equal(JSON.parse(deleted.body).files, 1)
    assert.equal(changes, before + 3)
    const conflict = await send(server.url, 'POST', '/api/files', JSON.stringify({ op: 'create', path: 'src/a.ts' }), JSON_WRITE)
    assert.equal(conflict.status, 409)
    assert.equal(changes, before + 3, 'nothing changed: no rebuild')
  })

  it('previews where a new file lands', async () => {
    const preview = async (path: string) => JSON.parse((await send(server.url, 'GET', `/api/files/classify?path=${encodeURIComponent(path)}`)).body)
    assert.deepEqual(await preview('web/Card.test.tsx'), { path: 'web/Card.test.tsx', layer: 'frontend', role: 'test', reason: 'rule', excluded: false })
    assert.deepEqual(await preview('tools/x.ts'), { path: 'tools/x.ts', excluded: true })
    assert.equal((await send(server.url, 'GET', '/api/files/classify?path=../x')).status, 403)
  })

  it('refuses writes without the guard, and on a read-only server', async () => {
    const body = JSON.stringify({ op: 'create', path: 'pwned.txt', content: 'x' })
    assert.equal((await send(server.url, 'POST', '/api/files', body, { 'Content-Type': 'application/json' })).status, 403)
    assert.equal((await send(server.url, 'POST', '/api/files', body, { ...JSON_WRITE, Origin: 'https://evil.example' })).status, 403)
    assert.equal((await send(server.url, 'POST', '/api/files', body, { ...JSON_WRITE, Host: 'evil.example' })).status, 403)
    assert.equal((await send(readOnly.url, 'POST', '/api/files', body, JSON_WRITE)).status, 405)
    assert.equal((await send(readOnly.url, 'GET', '/api/files')).status, 404)
    assert.ok(!existsSync(join(repo, 'pwned.txt')))
  })
})

describe('the file list after git commands', () => {
  it('is read again, not served from the cache', async () => {
    const dir = freshRepo()
    execFileSync('git', ['add', '.'], { cwd: dir })
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
    const out = join(dir, '..', `out-git-${n}`)
    mkdirSync(out)
    writeFileSync(join(out, 'graph.json'), JSON.stringify({ version: 1, meta: { repo: { name: 'x', root: dir } }, nodes: [], edges: [], unresolved: [] }))
    const server = await startServer({ graphPath: join(out, 'graph.json'), repoRoot: dir, port: 0, host: '127.0.0.1', distDir: out, writable: true })
    try {
      const list = async () => (JSON.parse((await send(server.url, 'GET', '/api/files')).body) as { files: string[] }).files
      const headers = { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' }
      await send(server.url, 'POST', '/api/files', JSON.stringify({ op: 'delete', path: 'src/a.ts' }), headers)
      assert.ok(!(await list()).includes('src/a.ts'))
      // Within the cache's second: the discard brings the file back, and the list says so.
      await send(server.url, 'POST', '/api/git', JSON.stringify({ type: 'discard', files: ['src/a.ts'] }), headers)
      assert.ok((await list()).includes('src/a.ts'))
    } finally {
      await server.close()
    }
  })
})
