/**
 * `repomap serve`: serves the built viewer + graph.json, pushes live reloads over Server-Sent Events,
 * and (with --watch) rebuilds the graph when files in the repository change.
 */
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, readdirSync, statSync, watch } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { extname, join, normalize, relative, sep } from 'node:path'
import { buildGraph } from './build.ts'
import { TOOL_ROOT, type RepoMapConfig } from './config.ts'
import { matcher } from './files.ts'
import { color, type Logger } from './log.ts'

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

const VIEWER_DIST = join(TOOL_ROOT, 'viewer', 'dist')

export async function serve(options: ServeOptions): Promise<void> {
  const { config, log } = options
  await ensureViewerBuilt(log)
  const graphPath = options.graphPath ?? config.output
  if (!options.graphPath && (options.build || !existsSync(graphPath))) {
    await buildGraph(config, { log })
  }

  const clients = new Set<ServerResponse>()
  const broadcast = (event: string, data: unknown) => {
    for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/graph.json') {
      if (!existsSync(graphPath)) {
        res.writeHead(404).end('graph.json not built yet')
        return
      }
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'], 'Cache-Control': 'no-store' })
      createReadStream(graphPath).pipe(res)
      return
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      res.write(`event: hello\ndata: ${JSON.stringify({ watch: options.watch })}\n\n`)
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    serveStatic(url.pathname, res)
  })

  const port = await listen(server, options.port, options.host)
  const address = `http://${options.host === '0.0.0.0' ? 'localhost' : options.host}:${port}`
  log.info(`\n  ${color.bold('repomap')} viewer running at ${color.cyan(address)}`)
  log.info(color.dim(`  graph: ${relative(process.cwd(), graphPath) || graphPath}${options.watch ? ' · watching for changes' : ''} · Ctrl+C to stop\n`))

  // Keep SSE connections alive through proxies.
  setInterval(() => broadcast('ping', Date.now()), 25_000).unref()

  if (options.watch && !options.graphPath) {
    startWatcher(config, log, () => broadcast('graph', { at: Date.now() }))
  }
  if (options.open) openBrowser(address)
}

function serveStatic(pathname: string, res: ServerResponse): void {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
  let file = join(VIEWER_DIST, safe)
  if (!file.startsWith(VIEWER_DIST + sep) && file !== VIEWER_DIST) {
    res.writeHead(403).end()
    return
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(VIEWER_DIST, 'index.html')
  const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream'
  const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache })
  createReadStream(file).pipe(res)
}

function listen(server: ReturnType<typeof createServer>, port: number, host: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    let attempt = 0
    const tryListen = (p: number) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && attempt < 20) {
          attempt++
          tryListen(p + 1)
        } else reject(error)
      })
      server.listen(p, host, () => resolvePort(p))
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

function startWatcher(config: RepoMapConfig, log: Logger, onRebuilt: () => void): void {
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
      if (result.changed) onRebuilt()
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
  try {
    watch(config.repoRoot, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const path = filename.toString().split(sep).join('/')
      if (ignored(path)) return
      log.debug(`changed: ${path}`)
      clearTimeout(timer)
      timer = setTimeout(() => void rebuild(), 600)
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
