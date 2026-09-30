import { existsSync, readFileSync, watch } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleApi, workspaceAllows } from '../src/core/api.ts'
import { readSource } from '../src/core/source.ts'
import type { RepoGraph } from '../src/shared/types.ts'

const viewerRoot = dirname(fileURLToPath(import.meta.url))
const toolRoot = resolve(viewerRoot, '..')
const graphFile = resolve(toolRoot, '.out', 'graph.json')
const gitFile = resolve(toolRoot, '.out', 'git.json')

/**
 * `npm run dev` serves the last built graph (tools/repomap/.out/graph.json) as /graph.json and
 * pushes a reload event when it changes, like `repomap serve` does, including saving files and
 * running git commands in the mapped repository. The production build is a plain static site.
 */
function devGraph(): Plugin {
  return {
    name: 'repomap-dev-graph',
    apply: 'serve',
    configureServer(server) {
      const clients = new Set<import('node:http').ServerResponse>()
      if (existsSync(dirname(graphFile))) {
        watch(dirname(graphFile), (_event, name) => {
          if (name === 'graph.json') for (const client of clients) client.write('event: graph\ndata: {}\n\n')
          if (name === 'git.json') for (const client of clients) client.write('event: git\ndata: {}\n\n')
        })
      }
      const readGraph = (): RepoGraph | undefined => {
        try {
          return JSON.parse(readFileSync(graphFile, 'utf8')) as RepoGraph
        } catch {
          return undefined
        }
      }
      const repoRoot = () => readGraph()?.meta.repo.root ?? resolve(toolRoot, '..', '..')
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url.startsWith('/api/') || (url === '/source' && req.method === 'PUT')) {
          handleApi(req, res, new URL(req.url ?? '/', 'http://localhost'), { repoRoot, graph: readGraph })
            .then((handled) => handled || next())
            .catch(next)
          return
        }
        if (url === '/graph.json') {
          if (!existsSync(graphFile)) {
            res.statusCode = 404
            res.end('No graph yet: run `npm run map`')
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(readFileSync(graphFile))
          return
        }
        if (url === '/git.json') {
          if (!existsSync(gitFile)) {
            res.statusCode = 404
            res.end('No git history yet: run `npm run map`')
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(readFileSync(gitFile))
          return
        }
        if (url === '/source') {
          const path = new URL(req.url ?? '/', 'http://localhost').searchParams.get('path')
          const result = readSource(repoRoot(), readGraph(), path, workspaceAllows(repoRoot()))
          res.statusCode = result.ok ? 200 : result.status
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          if (result.ok) {
            res.setHeader('ETag', result.etag)
            res.setHeader('X-Repomap-Writable', '1')
          }
          res.end(result.ok ? result.text : result.error)
          return
        }
        if (url === '/events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
          res.write('event: hello\ndata: {}\n\n')
          clients.add(res)
          req.on('close', () => clients.delete(res))
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  root: viewerRoot,
  // Relative asset URLs: the built site works from any sub-path (GitHub Pages, a CDN folder…).
  base: './',
  plugins: [react(), devGraph()],
  server: { port: 5198, fs: { allow: [toolRoot] } },
  preview: { port: 5198 },
  build: {
    outDir: resolve(viewerRoot, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
})
