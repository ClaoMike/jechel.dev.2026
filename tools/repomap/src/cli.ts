#!/usr/bin/env node
/**
 * repomap CLI.
 *
 *   node src/cli.ts build     [-c config] [--no-cache] [--public]
 *   node src/cli.ts serve     [-c config] [--build] [--watch] [--port 5199] [--no-open] [--graph file] [--git file]
 *   node src/cli.ts validate  [graph.json]
 *   node src/cli.ts diff      <before.json> <after.json>   (default: previous history entry vs current)
 *   node src/cli.ts history   [-c config] [--public]   (git.json only)
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildGraph, readGraph } from './core/build.ts'
import { loadConfig, TOOL_ROOT } from './core/config.ts'
import { diffGraphs, formatDiff } from './core/diff.ts'
import { updateGitHistory } from './core/git-history.ts'
import { color, createLogger } from './core/log.ts'
import { ensureViewerBuilt, serve } from './core/serve.ts'
import { validateGraph } from './core/validate.ts'

const HELP = `${color.bold('repomap')} — 3D architecture map of a repository

Usage: node src/cli.ts <command> [options]

Commands
  build              Extract, link and lay out the graph → graph.json (and the git history → git.json)
  history            Only read the git history → git.json
  serve              Open the viewer in the browser (builds the viewer if needed)
  validate [file]    Check a graph.json against the schema
  diff [a] [b]       Structural diff of two graphs (default: last two builds)
  build-viewer       Build the static viewer into viewer/dist

Options
  -c, --config <file>   Config file (default: ./repomap.config.json)
      --no-cache        Re-run every plugin
      --public          Leave the absolute repository path and uncommitted changes out
      --relayout        Lay the graph out from scratch (ignore previous positions)
      --build           serve: rebuild the graph before serving
  -w, --watch           serve: rebuild when repository files change (live reload)
  -p, --port <n>        serve: port (default 5199)
      --host <host>     serve: host (default 127.0.0.1)
      --no-open         serve: don't open a browser
      --graph <file>    serve: serve this graph.json instead of building one
      --git <file>      serve: serve this git.json (default: name.git.json or git.json beside the graph)
  -v, --verbose         Show plugin logs
  -q, --quiet           Only warnings and errors
`

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      'no-cache': { type: 'boolean' },
      public: { type: 'boolean' },
      relayout: { type: 'boolean' },
      build: { type: 'boolean' },
      watch: { type: 'boolean', short: 'w' },
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      'no-open': { type: 'boolean' },
      graph: { type: 'string' },
      git: { type: 'string' },
      verbose: { type: 'boolean', short: 'v' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [command = 'help', ...rest] = positionals
  const log = createLogger({ quiet: values.quiet, verbose: values.verbose })
  if (values.help || command === 'help') {
    process.stdout.write(HELP)
    return 0
  }

  const configPath = () =>
    values.config ?? (existsSync(resolve('repomap.config.json')) ? resolve('repomap.config.json') : join(TOOL_ROOT, 'repomap.config.json'))

  switch (command) {
    case 'build': {
      const config = loadConfig(configPath())
      await buildGraph(config, { log, noCache: values['no-cache'], publicOutput: values.public, relayout: values.relayout })
      return 0
    }
    case 'history': {
      const config = loadConfig(configPath())
      if (!config.history.enabled) {
        log.error('the history is turned off in the config (history.enabled)')
        return 1
      }
      const result = await updateGitHistory(config, { log, publicOutput: values.public })
      if (!result.history) {
        log.error(`${config.repoRoot} is not a git repository`)
        return 1
      }
      log.info(`${color.green('✔')} ${result.path}${result.changed ? '' : color.dim(' (unchanged)')}`)
      return 0
    }
    case 'serve': {
      const config = loadConfig(configPath())
      await serve({
        config,
        log,
        port: Number(values.port ?? 5199),
        host: values.host ?? '127.0.0.1',
        open: !values['no-open'],
        watch: !!values.watch,
        build: !!values.build,
        graphPath: values.graph ? resolve(values.graph) : undefined,
        gitPath: values.git ? resolve(values.git) : undefined,
      })
      return -1 // keep running
    }
    case 'build-viewer': {
      await ensureViewerBuilt(log, true)
      log.info(`${color.green('✔')} viewer built in viewer/dist`)
      return 0
    }
    case 'validate': {
      const file = rest[0] ? resolve(rest[0]) : loadConfig(configPath()).output
      const graph = readGraph(file)
      if (!graph) {
        log.error(`cannot read ${file}`)
        return 1
      }
      const problems = validateGraph(graph)
      if (problems.length === 0) {
        log.info(`${color.green('✔')} ${file} is valid (${graph.nodes.length} nodes, ${graph.edges.length} edges)`)
        return 0
      }
      for (const problem of problems) log.error(problem)
      return 1
    }
    case 'diff': {
      let [before, after] = rest.map((f) => resolve(f))
      if (!before || !after) {
        const config = loadConfig(configPath())
        const historyDir = join(config.output, '..', 'history')
        const entries = existsSync(historyDir) ? readdirSync(historyDir).filter((f) => f.endsWith('.json')).sort() : []
        if (entries.length < 2) {
          log.error('need two graphs: pass two files, or build twice so history has two entries')
          return 1
        }
        before = join(historyDir, entries[entries.length - 2])
        after = join(historyDir, entries[entries.length - 1])
      }
      const a = readGraph(before)
      const b = readGraph(after)
      if (!a || !b) {
        log.error('cannot read one of the graphs')
        return 1
      }
      process.stdout.write(`${formatDiff(diffGraphs(a, b))}\n`)
      return 0
    }
    default:
      log.error(`unknown command "${command}"`)
      process.stdout.write(HELP)
      return 1
  }
}

main().then(
  (code) => {
    if (code >= 0) process.exitCode = code
  },
  (error: Error) => {
    process.stderr.write(`${color.red('error')} ${error.message}\n`)
    process.exitCode = 1
  },
)
