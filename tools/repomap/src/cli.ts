#!/usr/bin/env node
/**
 * repomap CLI.
 *
 *   node src/cli.ts build     [-c config] [--no-cache] [--public]
 *   node src/cli.ts serve     [-c config] [--build] [--watch] [--port 5199] [--no-open] [--read-only] [--graph file] [--git file]
 *   node src/cli.ts validate  [graph.json]
 *   node src/cli.ts diff      <before.json> <after.json>   (default: previous history entry vs current)
 *   node src/cli.ts history   [-c config] [--public]   (git.json only)
 *   node src/cli.ts summarize [-c config] [--limit n] [--no-place]
 *   node src/cli.ts check     [-c config]
 *   node src/cli.ts suggest-rules [-c config]
 *   node src/cli.ts review    [base] [head]
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { reviewBriefing, suggestRules, summarizeBoard } from './core/ai/board-ai.ts'
import { SettingsStore } from './core/ai/settings.ts'
import { buildGraph, readGraph } from './core/build.ts'
import { loadConfig, TOOL_ROOT } from './core/config.ts'
import { diffGraphs, formatDiff } from './core/diff.ts'
import { updateGitHistory } from './core/git-history.ts'
import { color, createLogger, type Logger } from './core/log.ts'
import { readReviewDiff } from './core/review.ts'
import { ensureViewerBuilt, serve } from './core/serve.ts'
import { validateGitHistory, validateGraph } from './core/validate.ts'
import { touchedNodes, WORKTREE } from './shared/review.ts'
import type { GitHistory } from './shared/git-types.ts'
import type { RepoGraph } from './shared/types.ts'

const HELP = `${color.bold('repomap')} — 3D architecture map of a repository

Usage: node src/cli.ts <command> [options]

Commands
  build              Extract, link and lay out the graph → graph.json (and the git history → git.json)
  history            Only read the git history → git.json
  serve              Open the viewer in the browser (builds the viewer if needed)
  validate [file]    Check a graph.json (or git.json) against its schema
  diff [a] [b]       Structural diff of two graphs (default: last two builds)
  build-viewer       Build the static viewer into viewer/dist
  summarize          AI: place unplaced chips in features, then summarize chips, features, tiers and
                     the app (only what changed since the last run) → repomap.ai.json
  check              Build, then list the architecture rules' violations (exit 1 on an error)
  suggest-rules      AI: propose architecture rules for the config, from how the code connects
  review [base] [head]   The diff's touched chips per feature (default: uncommitted changes);
                     --brief adds the AI briefing

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
      --no-token        serve: on a network address, don't require the link's token
      --limit <n>       summarize: at most n chips this run
      --no-place        summarize: don't ask the AI to place chips in features
      --brief           review: also write the AI briefing
      --read-only       serve: never save files or run git commands from the viewer
                        (they are only offered for your own repository on a localhost address)
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
      'no-token': { type: 'boolean' },
      limit: { type: 'string' },
      'no-place': { type: 'boolean' },
      brief: { type: 'boolean' },
      'read-only': { type: 'boolean' },
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
        readOnly: !!values['read-only'],
        noToken: !!values['no-token'],
      })
      return -1 // keep running
    }
    case 'summarize': {
      const config = loadConfig(configPath())
      let last = ''
      const result = await summarizeBoard(config, {
        settings: new SettingsStore(),
        log,
        limit: values.limit ? Number(values.limit) : undefined,
        place: !values['no-place'],
        rebuild: async () => (await buildGraph(config, { log: createLogger({ quiet: true }), history: false })).graph,
        onProgress: (p) => {
          const line = `${p.phase} ${p.done}/${p.total}`
          if (line !== last && p.phase !== 'done') log.step(line)
          last = line
        },
      })
      log.info(
        `${color.green('✔')} ${result.written} summaries written, ${result.placed} chips placed in features${result.failed ? color.yellow(`, ${result.failed} failed`) : ''}${
          result.remaining ? color.dim(` (${result.remaining} chips left for the next run)`) : ''
        } → ${relativeTo(config.ai.file)}`,
      )
      return result.failed > 0 && result.written === 0 ? 1 : 0
    }
    case 'check': {
      const config = loadConfig(configPath())
      const { graph } = await buildGraph(config, { log: createLogger({ quiet: true }), history: false })
      return printViolations(graph, log)
    }
    case 'suggest-rules': {
      const config = loadConfig(configPath())
      const { graph } = await buildGraph(config, { log: createLogger({ quiet: true }), history: false })
      const rules = await suggestRules(config, graph, { settings: new SettingsStore(), log })
      process.stdout.write(`${JSON.stringify(rules, null, 2)}\n`)
      log.info(color.dim(`Saved in ${relativeTo(config.ai.file)} (suggestedRules). Copy the ones you want into "rules" in ${relativeTo(config.configPath)}.`))
      return 0
    }
    case 'review': {
      const config = loadConfig(configPath())
      const graph = readGraph(config.output) ?? (await buildGraph(config, { log, history: false })).graph
      const [base, head] = rest.length >= 2 ? rest : rest.length === 1 ? [rest[0], WORKTREE] : [null, WORKTREE]
      const diff = await readReviewDiff(config.repoRoot, base, head)
      const touched = touchedNodes(graph.nodes, diff.files)
      log.info(`${color.bold(diff.label)}: ${diff.files.length} files, ${touched.size} nodes touched`)
      const byFeature = new Map<string, string[]>()
      for (const node of graph.nodes) {
        if (!touched.has(node.id)) continue
        const key = `${node.feature ?? 'shared'} · ${node.layer}`
        ;(byFeature.get(key) ?? byFeature.set(key, []).get(key)!).push(node.label)
      }
      for (const [key, labels] of [...byFeature].sort()) log.info(`  ${color.cyan(key)}: ${labels.slice(0, 12).join(', ')}${labels.length > 12 ? ` +${labels.length - 12}` : ''}`)
      if (values.brief) {
        const markdown = await reviewBriefing(config, graph, { diff, touched: [...touched.keys()], impacted: [], tests: [] }, { settings: new SettingsStore(), log })
        process.stdout.write(`\n${markdown}\n`)
      }
      return 0
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
      // A git.json (the history tab) is checked against its own schema.
      if ((graph as unknown as { kind?: string }).kind === 'repomap-git') {
        const history = graph as unknown as GitHistory
        const problems = validateGitHistory(history)
        if (problems.length === 0) {
          log.info(`${color.green('✔')} ${file} is valid (${history.commits.length} commits, ${history.refs.length} refs)`)
          return 0
        }
        for (const problem of problems) log.error(problem)
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

function relativeTo(path: string): string {
  return relative(process.cwd(), path) || path
}

/** Lists the violations by rule; 1 when one is an error. */
function printViolations(graph: RepoGraph, log: Logger): number {
  const rules = graph.board?.rules ?? []
  const violations = graph.board?.violations ?? []
  if (rules.length === 0) {
    log.info('No architecture rules in the config ("rules"). `node src/cli.ts suggest-rules` proposes some.')
    return 0
  }
  for (const rule of rules) {
    const broken = violations.filter((v) => v.rule === rule.id)
    const mark = broken.length === 0 ? color.green('✔') : (rule.severity ?? 'warn') === 'error' ? color.red('✖') : color.yellow('!')
    log.info(`${mark} ${color.bold(rule.id)} ${color.dim(rule.description)}${broken.length ? ` — ${broken.length}` : ''}`)
    for (const v of broken.slice(0, 20)) log.info(`    ${v.message}${v.evidence ? color.dim(`  ${v.evidence.file}:${v.evidence.line ?? ''}`) : ''}`)
    if (broken.length > 20) log.info(color.dim(`    … ${broken.length - 20} more`))
  }
  return violations.some((v) => v.severity === 'error') ? 1 : 0
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
