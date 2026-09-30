/**
 * A real repository per test, served by `repomap serve` with editing on: a bare "origin", the working
 * clone the viewer edits and commits in, and a "teammate" clone that pushes. By default the map is the
 * demo graph re-pointed at the clone (so BookCard.tsx is a real file); with `realMap` it is built from
 * the clone by the real pipeline (TypeScript + file extractors) and rebuilt after every file change.
 * The history is read from the clone and re-read after every command, like `npm start` does.
 */
import { test as base } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildGraph } from '../src/core/build.ts'
import { loadConfig, TOOL_ROOT } from '../src/core/config.ts'
import { readGitHistory } from '../src/core/git-history.ts'
import { createLogger } from '../src/core/log.ts'
import { classifyPath, startServer, type ServerHandle } from '../src/core/serve.ts'
import type { RepoGraph } from '../src/shared/types.ts'
import { BOOK_CARD_SOURCE } from './helpers.ts'

// The user's git config must not leak into the tests (signing, hooks, default branch…).
const sandbox = mkdtempSync(join(tmpdir(), 'repomap-e2e-'))
writeFileSync(join(sandbox, 'gitconfig'), '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n')
process.env.GIT_CONFIG_GLOBAL = join(sandbox, 'gitconfig')
process.env.GIT_CONFIG_NOSYSTEM = '1'

export const BOOK_CARD_FILE = 'web/src/features/books/BookCard.tsx'
const DEMO_GRAPH = join(import.meta.dirname, '..', 'viewer', 'public', 'samples', 'demo.graph.json')

export interface Repo {
  /** The viewer, served from the working clone. */
  url: string
  /** The working clone. */
  dir: string
  origin: string
  /** A second clone, for "someone else pushed". */
  teammate: string
  git(...args: string[]): string
  read(path: string): string
  write(path: string, text: string): void
  /** Runs git in the teammate's clone. */
  teammateGit(...args: string[]): string
}

function sh(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

async function createRepo(realMap: boolean): Promise<{ repo: Repo; server: ServerHandle; cleanup(): Promise<void> }> {
  const root = mkdtempSync(join(sandbox, 'case-'))
  const origin = join(root, 'origin.git')
  const dir = join(root, 'repo')
  const teammate = join(root, 'teammate')
  const out = join(root, 'out')
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }

  sh(root, ['init', '--quiet', '--bare', origin])
  sh(root, ['clone', '--quiet', origin, dir])
  write(BOOK_CARD_FILE, BOOK_CARD_SOURCE)
  write('README.md', '# Bookshelf\n')
  // A React app (the preset puts everything under a package.json that depends on React on the Frontend plane).
  write('web/package.json', '{ "name": "web", "private": true, "dependencies": { "react": "^19.0.0" } }\n')
  sh(dir, ['add', '.'])
  sh(dir, ['commit', '--quiet', '-m', 'Initial commit'])
  write('README.md', '# Bookshelf\n\nA shelf of books.\n')
  sh(dir, ['commit', '--quiet', '-am', 'Describe the project'])
  sh(dir, ['push', '--quiet', '-u', 'origin', 'main'])
  sh(dir, ['remote', 'set-head', 'origin', 'main'])
  // A pushed feature branch that touches BookCard.tsx (merging it into a changed main conflicts).
  sh(dir, ['switch', '--quiet', '-c', 'feature/reviews'])
  write(BOOK_CARD_FILE, BOOK_CARD_SOURCE.replace('{title}</article>', '{title} ★★★★☆</article>'))
  sh(dir, ['commit', '--quiet', '-am', 'Show the rating'])
  sh(dir, ['push', '--quiet', '-u', 'origin', 'feature/reviews'])
  sh(dir, ['switch', '--quiet', 'main'])
  sh(root, ['clone', '--quiet', origin, teammate])

  mkdirSync(out)
  const gitPath = join(out, 'git.json')
  const config = realMap ? mapConfig(dir, out) : undefined
  if (config) {
    await buildGraph(config, { log: quiet })
  } else {
    // The demo map, describing this checkout.
    const graph = JSON.parse(readFileSync(DEMO_GRAPH, 'utf8')) as RepoGraph
    graph.meta.repo = { name: 'bookshelf', root: dir, branch: 'main' }
    writeFileSync(join(out, 'graph.json'), JSON.stringify(graph))
  }
  let server: ServerHandle | undefined
  let last = ''
  let closed = false
  const refresh = async () => {
    const history = await readGitHistory(dir, { name: 'bookshelf', maxCommits: 500, maxFilesPerCommit: 100, github: 'off', githubCacheMinutes: 10, maxPullRequests: 50 })
    const text = JSON.stringify({ ...history, generatedAt: undefined })
    // A save can finish while the test is being torn down.
    if (!history || text === last || closed) return
    last = text
    writeFileSync(gitPath, JSON.stringify(history))
    server?.broadcast('git', { at: Date.now() })
  }
  await refresh()
  // Like `npm start`: the map is rebuilt when files change (one build at a time).
  let building: Promise<void> = Promise.resolve()
  const rebuild = () => {
    if (!config) return
    building = building.then(async () => {
      if (closed) return
      const result = await buildGraph(config, { log: quiet })
      if (!closed && result.changed) server?.broadcast('graph', { at: Date.now() })
      await refresh()
    })
  }
  server = await startServer({
    graphPath: join(out, 'graph.json'),
    gitPath,
    repoRoot: dir,
    port: 0,
    host: '127.0.0.1',
    writable: true,
    onSaved: () => (config ? rebuild() : void refresh()),
    onGitChanged: refresh,
    onFilesChanged: rebuild,
    classify: config ? (path) => classifyPath(config, path) : undefined,
  })
  const repo: Repo = {
    url: server.url,
    dir,
    origin,
    teammate,
    git: (...args) => sh(dir, args),
    read: (path) => readFileSync(join(dir, path), 'utf8'),
    write,
    teammateGit: (...args) => sh(teammate, args),
  }
  return {
    repo,
    server,
    cleanup: async () => {
      closed = true
      await building.catch(() => undefined)
      rmSync(root, { recursive: true, force: true })
    },
  }
}

const quiet = createLogger({ quiet: true })

/** The real preset, without the .NET extractors (no C# here, and no SDK needed). */
function mapConfig(dir: string, out: string) {
  const path = join(out, 'repomap.config.json')
  writeFileSync(
    path,
    JSON.stringify({
      extends: join(TOOL_ROOT, 'presets', 'react-aspnet-efcore-postgres.json'),
      name: 'bookshelf',
      repoRoot: dir,
      output: join(out, 'graph.json'),
      history: { github: 'off' },
      plugins: [
        { id: 'dotnet', enabled: false },
        { id: 'efcore', enabled: false },
      ],
    }),
  )
  return loadConfig(path)
}

export const test = base.extend<{ repo: Repo; realMap: boolean }>({
  realMap: [false, { option: true }],
  repo: async ({ realMap }, use) => {
    const { repo, server, cleanup } = await createRepo(realMap)
    await use(repo)
    await server.close()
    await cleanup()
  },
})

export { expect } from '@playwright/test'
