/**
 * `repomap serve`: serves the built viewer + graph.json (+ git.json), source files for the code panel,
 * pushes live reloads over Server-Sent Events, and (with --watch) rebuilds when the repository changes.
 */
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { dirname, extname, join, normalize, relative, sep } from 'node:path'
import type { RepoGraph } from '../shared/types.ts'
import { buildGraph } from './build.ts'
import { TOOL_ROOT, type RepoMapConfig } from './config.ts'
import { matcher } from './files.ts'
import { color, type Logger } from './log.ts'
import { readSource } from './source.ts'

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

  const server: Server = createServer((req, res) => {
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      res.writeHead(400).end()
      return
    }
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
        const graph = currentGraph()
        const result = readSource(graph?.meta.repo.root ?? options.repoRoot, graph, url.searchParams.get('path'))
        if (result.ok) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
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
        return serveStatic(dist, url.pathname, res)
    }
  })

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
  const handle = await startServer({
    graphPath,
    gitPath: join(dirname(config.output), 'git.json'),
    repoRoot: config.repoRoot,
    port: options.port,
    host: options.host,
    watching: options.watch,
  })
  log.info(`\n  ${color.bold('repomap')} viewer running at ${color.cyan(handle.url)}`)
  log.info(color.dim(`  graph: ${relative(process.cwd(), graphPath) || graphPath}${options.watch ? ' · watching for changes' : ''} · Ctrl+C to stop\n`))
  if (options.watch && !options.graphPath) {
    startWatcher(config, log, (event) => handle.broadcast(event, { at: Date.now() }))
  }
  if (options.open) openBrowser(handle.url)
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

/** Rebuilds after file changes (debounced, never two builds at once) and reports what changed. */
function startWatcher(config: RepoMapConfig, log: Logger, onRebuilt: (event: 'graph' | 'git') => void): void {
  const ignored = matcher([...ALWAYS_IGNORED, ...config.exclude])
  let timer: NodeJS.Timeout | undefined
  let running = false
  let again = false
  const rebuild = async () => {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      const result = await buildGraph(config, { log })
      if (result.changed) onRebuilt('graph')
      if (result.gitChanged) onRebuilt('git')
    } catch (error) {
      log.error(`rebuild failed: ${(error as Error).message}`)
    } finally {
      running = false
      if (again) {
        again = false
        void rebuild()
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
      // Commits, checkouts and fetches move refs: rebuild so the Git tab stays current.
      if (/^\.git\/(HEAD|packed-refs|refs\/|FETCH_HEAD|ORIG_HEAD)/.test(path)) {
        log.debug(`git changed: ${path}`)
        schedule()
        return
      }
      if (ignored(path)) return
      log.debug(`changed: ${path}`)
      schedule()
    })
  } catch (error) {
    log.warn(`file watching unavailable: ${(error as Error).message}`)
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
