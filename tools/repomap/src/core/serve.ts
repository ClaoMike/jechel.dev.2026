/**
 * `repomap serve`: serves the built viewer + graph.json (+ git.json), source files for the code panel,
 * pushes live reloads over Server-Sent Events, and (with --watch) rebuilds when the repository changes.
 * When writable (see api.ts), the code panel saves files and the History tab runs git commands.
 */
/// <reference path="./qrcode-terminal.d.ts" />
import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { dirname, extname, join, normalize, relative, sep } from 'node:path'
import type { RepoGraph } from '../shared/types.ts'
import { Assistant } from './ai/assistant.ts'
import { ConversationStore } from './ai/conversations.ts'
import { SettingsStore } from './ai/settings.ts'
import { handleApi, isLoopbackHost, workspaceAllows, type ApiContext } from './api.ts'
import { buildGraph, readGraph } from './build.ts'
import { TOOL_ROOT, type RepoMapConfig } from './config.ts'
import { classifyFiles, matcher } from './files.ts'
import { gitHistoryPath, historyBeside, updateGitHistory } from './git-history.ts'
import { color, type Logger } from './log.ts'
import { readReviewDiff, ReviewError } from './review.ts'
import { readSource } from './source.ts'
import { workspaceFiles } from './workspace.ts'

export interface ServeOptions {
  config: RepoMapConfig
  log: Logger
  port: number
  host: string
  open: boolean
  watch: boolean
  build: boolean
  /** Serve this graph file instead of the config output. */
  graphPath?: string
  /** Serve this git.json (default: the one beside the graph). */
  gitPath?: string
  /** Never save files or run git commands. */
  readOnly?: boolean
  /** Off a loopback host: don't ask for the access token (anyone on the network can open it). */
  noToken?: boolean
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

export const VIEWER_DIST = join(TOOL_ROOT, 'viewer', 'dist')

export interface ServerOptions {
  graphPath: string
  /** git.json (the Git history tab). Defaults to git.json next to the graph. */
  gitPath?: string
  /** Repository the graph describes (source files are read from here). */
  repoRoot: string
  port: number
  host: string
  watching?: boolean
  distDir?: string
  /** Let the viewer save files and run git commands in `repoRoot` (default: off). */
  writable?: boolean
  /** After the code panel saved a file. */
  onSaved?(path: string): void
  /** After a git command: re-read the history (the server then announces it). */
  onGitChanged?(): Promise<void>
  /** After files were created, deleted or renamed from the viewer. */
  onFilesChanged?(): void
  /** The layer and role the build gives a path (the "new file" dialog shows it). */
  classify?(path: string): { layer: string; role: string; reason: string } | undefined
  /** The AI assistant (writable servers only): where settings and chats live; tests set a fake API. */
  ai?: { settingsPath?: string; conversationsDir: string; baseURL?: string }
  /** The Board's AI work (writable servers with the assistant): the config and a rebuild. */
  board?: { config: RepoMapConfig; rebuild(): Promise<RepoGraph> }
  /**
   * Required (once, as ?token=…, then a cookie) from every browser that isn't on this machine:
   * a server on the network serves your code to whoever has the link.
   */
  token?: string
}

export interface ServerHandle {
  url: string
  port: number
  broadcast(event: string, data: unknown): void
  close(): Promise<void>
}

/** Starts the HTTP server (no build, no watcher, no browser): used by `serve` and by tests. */
export async function startServer(options: ServerOptions): Promise<ServerHandle> {
  const dist = options.distDir ?? VIEWER_DIST
  const gitPath = options.gitPath ?? join(dirname(options.graphPath), 'git.json')
  const clients = new Set<ServerResponse>()
  let cached: { mtime: number; graph: RepoGraph | undefined } | undefined
  const currentGraph = (): RepoGraph | undefined => {
    try {
      const mtime = statSync(options.graphPath).mtimeMs
      if (!cached || cached.mtime !== mtime) cached = { mtime, graph: JSON.parse(readFileSync(options.graphPath, 'utf8')) as RepoGraph }
      return cached.graph
    } catch {
      return undefined
    }
  }

  const repoRoot = () => currentGraph()?.meta.repo.root ?? options.repoRoot
  let ai: ApiContext['ai']
  if (options.writable && options.ai) {
    const settings = new SettingsStore(options.ai.settingsPath)
    const conversations = new ConversationStore(options.ai.conversationsDir)
    const assistant = new Assistant({
      root: repoRoot,
      graph: currentGraph,
      settings,
      conversations,
      baseURL: options.ai.baseURL,
      // Rebuild the map (which re-reads the history too); with --watch the watcher does it.
      filesChanged: () => options.onFilesChanged?.(),
      gitChanged: () => options.onGitChanged?.() ?? Promise.resolve(),
    })
    ai = { assistant, settings, conversations, baseURL: options.ai.baseURL }
  }
  const board = options.board && { ...options.board, broadcast: (event: string, data: unknown) => broadcast(event, data) }
  const server: Server = createServer((req, res) => {
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      res.writeHead(400).end()
      return
    }
    if (options.token && !tokenAccepted(req, res, url, options.token)) return
    if (url.pathname === '/api/review' && req.method === 'GET') {
      void review(res, url)
      return
    }
    if (options.writable) {
      handleApi(req, res, url, {
        repoRoot,
        graph: currentGraph,
        onSaved: options.onSaved,
        onGitChanged: options.onGitChanged,
        onFilesChanged: options.onFilesChanged,
        classify: options.classify,
        ai,
        board,
      })
        .then((handled) => handled || route(req, res, url))
        .catch((error: Error) => {
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(error.message)
        })
    } else {
      route(req, res, url)
    }
  })

  /** Review mode's diff: read-only, so every server answers it (phones on the network too). */
  const review = async (res: ServerResponse, url: URL): Promise<void> => {
    const json = (status: number, value: unknown): void => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(value))
    }
    // A --graph file may describe another checkout: its diff isn't ours to read.
    if (!currentGraph()?.meta.repo.root && !options.writable) return json(404, { error: 'Review needs the repository: serve it with `npm start`' })
    try {
      const diff = await readReviewDiff(repoRoot(), url.searchParams.get('base'), url.searchParams.get('head'))
      json(200, url.searchParams.get('patch') === '1' ? diff : { ...diff, patch: undefined })
    } catch (error) {
      json(error instanceof ReviewError ? 400 : 500, { error: (error as Error).message })
    }
  }

  const route = (req: IncomingMessage, res: ServerResponse, url: URL): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    switch (url.pathname) {
      case '/graph.json':
        return sendFile(res, options.graphPath, 'graph.json not built yet: run `npm run map`')
      case '/git.json':
        return sendFile(res, gitPath, 'git.json not built yet: run `npm run map`')
      case '/source': {
        // A writable server opens any file git lists: only for pages served from this machine.
        const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase()
        if (options.writable && !isLoopbackHost(host)) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Only on localhost')
          return
        }
        const result = readSource(repoRoot(), currentGraph(), url.searchParams.get('path'), options.writable ? workspaceAllows(repoRoot()) : undefined)
        if (result.ok) {
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ETag: result.etag,
            // Whether the code panel may save it.
            'X-Repomap-Writable': options.writable ? '1' : '0',
          })
          res.end(result.text)
        } else {
          res.writeHead(result.status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(result.error)
        }
        return
      }
      case '/events':
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
        res.write(`event: hello\ndata: ${JSON.stringify({ watch: !!options.watching })}\n\n`)
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      default:
        if (url.pathname === '/api/info') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end('{"writable":false}')
          return
        }
        // Editing API of a read-only server: a clear "no" rather than the app.
        if (url.pathname.startsWith('/api/')) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('This server is read-only')
          return
        }
        return serveStatic(dist, url.pathname, res)
    }
  }

  const port = await listen(server, options.port, options.host)
  const keepAlive = setInterval(() => broadcast('ping', Date.now()), 25_000)
  keepAlive.unref()
  function broadcast(event: string, data: unknown) {
    for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  return {
    url: `http://${options.host === '0.0.0.0' ? 'localhost' : options.host}:${port}`,
    port,
    broadcast,
    close: () =>
      new Promise((resolveClose) => {
        ai?.assistant.closeAll()
        clearInterval(keepAlive)
        for (const client of clients) client.end()
        server.close(() => resolveClose())
        server.closeAllConnections?.()
      }),
  }
}

export async function serve(options: ServeOptions): Promise<void> {
  const { config, log } = options
  await ensureViewerBuilt(log)
  const graphPath = options.graphPath ?? config.output
  if (!options.graphPath && (options.build || !existsSync(graphPath))) {
    await buildGraph(config, { log })
  }
  // Only your own repository, only on this machine: a --graph file may describe another checkout.
  const writable = !options.graphPath && !options.readOnly && isLoopbackHost(options.host)
  // Served to the network (a phone): read-only, behind a token in the link.
  const lan = !isLoopbackHost(options.host)
  const token = lan && !options.noToken ? randomBytes(12).toString('base64url') : undefined
  let handle: ServerHandle | undefined
  const announce = (event: 'graph' | 'git') => handle?.broadcast(event, { at: Date.now() })
  const watcher = options.watch && !options.graphPath ? startWatcher(config, log, announce) : undefined
  const refreshHistory = watcher?.refreshHistory ?? serialized(async () => {
    const result = await updateGitHistory(config, { log })
    if (result.changed) announce('git')
  })
  // Without a watcher, files created, deleted or renamed from the viewer rebuild the map here.
  const rebuild = serialized(async () => {
    const result = await buildGraph(config, { log })
    if (result.changed) announce('graph')
    if (result.gitChanged) announce('git')
  })
  handle = await startServer({
    graphPath,
    gitPath: options.gitPath ?? (options.graphPath ? historyBeside(graphPath) : gitHistoryPath(config)),
    repoRoot: config.repoRoot,
    port: options.port,
    host: options.host,
    watching: options.watch,
    writable,
    // With --watch the saved file is picked up by the watcher (graph and history); without, the history shows the change.
    onSaved: watcher ? undefined : () => void refreshHistory().catch(() => undefined),
    onGitChanged: config.history.enabled ? refreshHistory : undefined,
    onFilesChanged: watcher ? undefined : () => void rebuild().catch((error: Error) => log.error(`rebuild failed: ${error.message}`)),
    classify: (path) => classifyPath(config, path),
    ai: { conversationsDir: join(dirname(config.output), 'ai', 'conversations') },
    board: options.graphPath
      ? undefined
      : {
          config,
          rebuild: async () => {
            await rebuild()
            const graph = readGraph(graphPath)
            if (!graph) throw new Error('The map could not be rebuilt')
            return graph
          },
        },
    token,
  })
  log.info(`\n  ${color.bold('repomap')} viewer running at ${color.cyan(handle.url)}`)
  if (lan) printNetworkUrls(log, options.host, handle.port, token)
  log.info(
    color.dim(
      `  graph: ${relative(process.cwd(), graphPath) || graphPath}${options.watch ? ' · watching for changes' : ''}${writable ? ' · editing on' : ' · read-only'} · Ctrl+C to stop\n`,
    ),
  )
  if (options.open) openBrowser(handle.url)
}

/** Lets a browser in once it brings the token (then remembers it in a cookie); false: answered with 401. */
function tokenAccepted(req: IncomingMessage, res: ServerResponse, url: URL, token: string): boolean {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase()
  if (isLoopbackHost(host)) return true
  const same = (value: string | undefined | null) => {
    if (!value) return false
    const a = Buffer.from(value)
    const b = Buffer.from(token)
    return a.length === b.length && timingSafeEqual(a, b)
  }
  const cookie = /(?:^|;\s*)repomap_token=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
  if (same(cookie)) return true
  if (same(url.searchParams.get('token'))) {
    url.searchParams.delete('token')
    res.writeHead(302, {
      'Set-Cookie': `repomap_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 86_400}`,
      Location: `${url.pathname}${url.search}`,
      'Cache-Control': 'no-store',
    })
    res.end()
    return false
  }
  res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end('Open the link repomap printed in the terminal (it ends with ?token=…).')
  return false
}

/** The addresses a phone on the same network can open, with the token, and a QR code of the first. */
function printNetworkUrls(log: Logger, host: string, port: number, token: string | undefined): void {
  const addresses =
    host === '0.0.0.0' || host === '::'
      ? Object.values(networkInterfaces())
          .flat()
          .filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal)
          .map((a) => a.address)
      : [host]
  const urls = addresses.map((address) => `http://${address}:${port}/${token ? `?token=${token}` : ''}`)
  if (urls.length === 0) {
    log.warn('no network address found: is this machine on Wi-Fi?')
    return
  }
  log.info(`  ${color.bold('On your phone')} (same Wi-Fi), read-only:`)
  for (const url of urls) log.info(`    ${color.cyan(url)}`)
  void import('qrcode-terminal')
    .then(({ default: qrcode }) => qrcode.generate(urls[0], { small: true }, (code: string) => log.info(`\n${code}`)))
    .catch(() => undefined)
}

/** The layer and role a (possibly new) file gets, from the config's rules; undefined when excluded. */
export function classifyPath(config: RepoMapConfig, path: string): { layer: string; role: string; reason: string } | undefined {
  if (matcher(config.exclude)(path)) return undefined
  const { files } = workspaceFiles(config.repoRoot)
  const entry = classifyFiles(files.includes(path) ? files : [...files, path], config).find((f) => f.path === path)
  return entry && { layer: entry.layer, role: entry.role, reason: entry.roleReason }
}

/** One run at a time; a call made during a run waits for it and runs again once. */
function serialized(task: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> = Promise.resolve()
  return () => {
    current = current.catch(() => undefined).then(task)
    return current
  }
}

function sendFile(res: ServerResponse, path: string, missing: string): void {
  if (!existsSync(path)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(missing)
    return
  }
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' })
  createReadStream(path).pipe(res)
}

function serveStatic(dist: string, pathname: string, res: ServerResponse): void {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  const safe = normalize(decoded).replace(/^([/\\])+/, '')
  let file = join(dist, safe)
  if (!file.startsWith(dist + sep) && file !== dist) {
    res.writeHead(403).end()
    return
  }
  // Unknown paths fall back to the app (it has no client routes, but keeps deep links working).
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('The viewer is not built: run `npm run build:viewer`')
    return
  }
  const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream'
  const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache })
  createReadStream(file).pipe(res)
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    let attempt = 0
    const tryListen = (p: number) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && attempt < 20) {
          attempt++
          tryListen(p + 1)
        } else reject(error)
      })
      server.listen(p, host, () => {
        const address = server.address()
        resolvePort(typeof address === 'object' && address ? address.port : p)
      })
    }
    tryListen(port)
  })
}

/** Builds the viewer with Vite when dist is missing or older than its sources. */
export async function ensureViewerBuilt(log: Logger, force = false): Promise<void> {
  const index = join(VIEWER_DIST, 'index.html')
  const sources = [join(TOOL_ROOT, 'viewer', 'src'), join(TOOL_ROOT, 'viewer', 'index.html'), join(TOOL_ROOT, 'src', 'shared'), join(TOOL_ROOT, 'viewer', 'public')]
  const built = existsSync(index) ? statSync(index).mtimeMs : 0
  if (!force && built > 0 && newestMtime(sources) <= built) return
  log.step('building the viewer (vite build)…')
  const { build } = await import('vite')
  await build({ configFile: join(TOOL_ROOT, 'viewer', 'vite.config.ts'), logLevel: 'warn' })
}

function newestMtime(paths: string[]): number {
  let newest = 0
  const visit = (path: string) => {
    if (!existsSync(path)) return
    const stat = statSync(path)
    if (stat.isDirectory()) for (const entry of readdirSync(path)) visit(join(path, entry))
    else newest = Math.max(newest, stat.mtimeMs)
  }
  paths.forEach(visit)
  return newest
}

const ALWAYS_IGNORED = ['.git/**', '**/node_modules/**', '**/bin/**', '**/obj/**', '**/dist/**', '**/.out/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**']

/**
 * Rebuilds after file changes (debounced, never two builds at once) and reports what changed.
 * Changes inside .git (commits, checkouts, fetches, staging) only refresh the history.
 */
function startWatcher(config: RepoMapConfig, log: Logger, onRebuilt: (event: 'graph' | 'git') => void): { refreshHistory(): Promise<void> } {
  const ignored = matcher([...ALWAYS_IGNORED, ...config.exclude])
  let timer: NodeJS.Timeout | undefined
  let running = false
  let pendingGraph = false
  let pendingHistory = false
  /** Callers waiting for the history to be re-read (after a git command). */
  let waiting: (() => void)[] = []
  const rebuild = async () => {
    if (running) return
    running = true
    try {
      while (pendingGraph || pendingHistory) {
        const graph = pendingGraph
        pendingGraph = false
        pendingHistory = false
        if (graph) {
          // A file change can also change the working tree shown in the History tab.
          const result = await buildGraph(config, { log })
          if (result.changed) onRebuilt('graph')
          if (result.gitChanged) onRebuilt('git')
        } else {
          const result = await updateGitHistory(config, { log })
          if (result.changed) onRebuilt('git')
        }
      }
    } catch (error) {
      log.error(`rebuild failed: ${(error as Error).message}`)
    } finally {
      running = false
      if (pendingGraph || pendingHistory) schedule()
      else {
        for (const resolveWait of waiting) resolveWait()
        waiting = []
      }
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void rebuild(), 600)
  }
  try {
    watch(config.repoRoot, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const path = filename.toString().split(sep).join('/')
      if (/^\.git\/(HEAD|index|packed-refs|refs\/|FETCH_HEAD|ORIG_HEAD|MERGE_HEAD)/.test(path)) {
        if (!config.history.enabled || path.endsWith('.lock')) return
        log.debug(`git changed: ${path}`)
        pendingHistory = true
        schedule()
        return
      }
      if (ignored(path)) return
      log.debug(`changed: ${path}`)
      pendingGraph = true
      schedule()
    })
  } catch (error) {
    log.warn(`file watching unavailable: ${(error as Error).message}`)
  }
  // Pull requests change on GitHub without anything happening locally.
  if (config.history.enabled && config.history.github === 'auto') {
    const refresh = setInterval(() => {
      pendingHistory = true
      schedule()
    }, Math.max(1, config.history.githubCacheMinutes) * 60_000 + 1000)
    refresh.unref()
  }
  return {
    refreshHistory: () =>
      new Promise<void>((resolveWait) => {
        waiting.push(resolveWait)
        pendingHistory = true
        clearTimeout(timer)
        void rebuild()
      }),
  }
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    spawn(command, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    // Opening a browser is a convenience; the URL is printed anyway.
  }
}
