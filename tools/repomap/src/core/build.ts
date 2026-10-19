/**
 * The pipeline: files → extractors (cached) → file refs → linkers → merge → layout → graph.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { computeLayout, vocabularyOptions, type Vec3 } from '../shared/layout.ts'
import { hashString } from '../shared/rng.ts'
import { edgeKey, GRAPH_VERSION, PROTOCOL_VERSION } from '../shared/types.ts'
import type {
  EdgeTypeDef,
  FileEntry,
  GraphChanges,
  GraphEdge,
  GraphMeta,
  GraphNode,
  KindDef,
  LayerDef,
  PluginOutput,
  PluginRequest,
  PluginRunInfo,
  RepoGraph,
  RoleDef,
  Vocabulary,
} from '../shared/types.ts'
import { hashFiles, hashSources, PluginCache, sha256 } from './cache.ts'
import type { PluginConfig, RepoMapConfig } from './config.ts'
import { classifyFiles, listRepoFiles, matcher } from './files.ts'
import { gitInfo } from './git.ts'
import { updateGitHistory } from './git-history.ts'
import { color, formatMs, type Logger } from './log.ts'
import { GraphAssembler } from './merge.ts'
import { checkRequires, runPlugin } from './plugins.ts'
import { validateGraph } from './validate.ts'

export interface BuildOptions {
  log: Logger
  noCache?: boolean
  /** Leave the absolute repo path out of graph.json (for publishing). */
  publicOutput?: boolean
  /** Ignore the previous positions and lay everything out from scratch. */
  relayout?: boolean
  /** Also refresh git.json (default true). */
  history?: boolean
}

export interface BuildResult {
  graph: RepoGraph
  outputPath: string
  durationMs: number
  changed: boolean
  /** git.json (Git history tab) differs from the previous build. */
  gitChanged?: boolean
}

const HISTORY_LIMIT = 30

export async function buildGraph(config: RepoMapConfig, options: BuildOptions): Promise<BuildResult> {
  const started = performance.now()
  const { log } = options
  const outDir = dirname(config.output)
  mkdirSync(outDir, { recursive: true })

  // ---- Files
  const allFiles = listRepoFiles(config.repoRoot)
  const files = classifyFiles(allFiles, config)
  const fileMap = new Map(files.map((f) => [f.path, f]))
  log.step(`${files.length} files in ${config.repoRoot} ${color.dim(`(${allFiles.length - files.length} excluded)`)}`)

  const vocabulary: Vocabulary = { layers: config.layers, roles: config.roles, kinds: config.kinds, edgeTypes: config.edgeTypes }
  const assembler = new GraphAssembler(fileMap, { layer: config.defaultLayer, role: config.defaultRole })
  const cache = new PluginCache(outDir)
  const toolVersion = readToolVersion(config.toolRoot)
  const sharedHash = hashSources(config.toolRoot, ['src/shared', 'src/plugin-kit.ts', 'schema'])
  const runs: PluginRunInfo[] = []

  // ---- Extractors, in config order (later ones see what earlier ones claimed)
  for (const plugin of config.plugins.filter((p) => p.kind === 'extractor')) {
    const pluginFiles = selectFiles(plugin, files)
    const claimed = [...assembler.claims].sort()
    const request = makeRequest(config, plugin, pluginFiles, claimed, vocabulary)
    const key = sha256(
      [
        PROTOCOL_VERSION,
        toolVersion,
        sharedHash,
        plugin.source ? hashSources(config.toolRoot, [plugin.source]) : '',
        JSON.stringify(plugin),
        JSON.stringify(pluginFiles),
        JSON.stringify(claimed),
        hashFiles(config.repoRoot, pluginFiles.map((f) => f.path)),
      ].join('\n'),
    )
    const output = await execute(plugin, request, { config, log, cache, key, noCache: options.noCache, runs })
    if (output) assembler.addOutput(plugin.id, output)
  }

  assembler.resolveFileRefs()

  // ---- Linkers see the merged graph and all facts (cheap, never cached)
  for (const plugin of config.plugins.filter((p) => p.kind === 'linker')) {
    const request = makeRequest(config, plugin, [], [...assembler.claims].sort(), vocabulary)
    request.graph = assembler.snapshot()
    const output = await execute(plugin, request, { config, log, runs, noCache: true })
    if (output) assembler.addOutput(plugin.id, output)
  }

  const { nodes, edges, unresolved } = assembler.finalize()
  const meta = buildMeta(config, nodes, edges, toolVersion, options.publicOutput)

  // ---- Layout: warm-started from the previous graph so the picture stays put between builds
  const previous = readGraph(config.output)
  const previousPositions = new Map<string, Vec3>()
  if (!options.relayout) for (const node of previous?.nodes ?? []) if (node.pos) previousPositions.set(node.id, node.pos)
  const layoutStarted = performance.now()
  const layoutNodes = nodes.map((n) => ({ id: n.id, layer: n.layer, role: n.role, parent: n.parent, tags: n.tags, size: kindSize(meta.kinds, n.kind), kind: n.kind }))
  const layoutOptions = {
    ...vocabularyOptions(meta.layers, meta.roles),
    layerGap: config.layout.layerGap,
    seed: config.layout.seed,
  }
  // Same layout inputs as last time: keep the positions exactly (a re-run would nudge them, and nudges add up).
  const signature = hashString(JSON.stringify([layoutNodes, edges.map(edgeKey).sort(), layoutOptions])).toString(36)
  const reuse = !options.relayout && previous?.meta.layout?.signature === signature && nodes.every((n) => previousPositions.has(n.id))
  const positions = reuse ? previousPositions : computeLayout(layoutNodes, edges, { ...layoutOptions, previous: previousPositions })
  for (const node of nodes) node.pos = positions.get(node.id)
  if (meta.layout) meta.layout.signature = signature
  log.debug(`layout: ${reuse ? 'unchanged, positions kept' : formatMs(performance.now() - layoutStarted)}`)

  // ---- Changes since the previous build
  const changes = computeChanges(previous, nodes, edges)
  const changed = !previous || changes !== undefined
  meta.changes = changes ?? previous?.meta.changes
  meta.plugins = runs
  const durationMs = Math.round(performance.now() - started)
  meta.stats = { nodes: nodes.length, edges: edges.length, unresolved: unresolved.length, durationMs }

  const graph: RepoGraph = {
    version: GRAPH_VERSION,
    meta,
    nodes,
    edges,
    unresolved,
    diagnostics: assembler.diagnostics.length > 0 ? assembler.diagnostics : undefined,
  }
  if (!graph.diagnostics) delete graph.diagnostics

  const problems = validateGraph(graph)
  for (const problem of problems) log.warn(`graph: ${problem}`)

  const text = stringifyGraph(graph)
  writeFileSync(config.output, text)
  if (changed) writeHistory(outDir, graph, text)

  summarize(graph, log)
  const history = options.history === false ? undefined : await updateGitHistory(config, { log, publicOutput: options.publicOutput })
  return { graph, outputPath: config.output, durationMs, changed, gitChanged: history?.changed }
}

function selectFiles(plugin: PluginConfig, files: FileEntry[]): FileEntry[] {
  const include = matcher(plugin.include ?? ['**/*'])
  const exclude = matcher(plugin.exclude)
  return files.filter((f) => include(f.path) && !exclude(f.path) && (!plugin.layers || plugin.layers.includes(f.layer)))
}

function makeRequest(
  config: RepoMapConfig,
  plugin: PluginConfig,
  files: FileEntry[],
  claimed: string[],
  vocabulary: Vocabulary,
): PluginRequest {
  return {
    protocol: PROTOCOL_VERSION,
    repoRoot: config.repoRoot,
    plugin: { id: plugin.id, kind: plugin.kind, options: plugin.options ?? {} },
    files,
    claimed,
    vocabulary,
  }
}

async function execute(
  plugin: PluginConfig,
  request: PluginRequest,
  context: {
    config: RepoMapConfig
    log: Logger
    runs: PluginRunInfo[]
    cache?: PluginCache
    key?: string
    noCache?: boolean
  },
): Promise<PluginOutput | undefined> {
  const { log, runs } = context
  const started = performance.now()
  const info: PluginRunInfo = { id: plugin.id, kind: plugin.kind, cached: false, durationMs: 0, nodes: 0, edges: 0, facts: 0, diagnostics: 0 }
  runs.push(info)
  const missing = checkRequires(plugin.requires)
  if (missing.length > 0) {
    info.error = `missing ${missing.join(', ')}`
    log.warn(`skipped plugin ${plugin.id}: ${missing.join(', ')} not found on PATH`)
    return undefined
  }
  let output: PluginOutput | undefined
  if (context.cache && context.key && !context.noCache) {
    output = context.cache.get(plugin.id, context.key)
    info.cached = !!output
  }
  if (!output) {
    try {
      output = await runPlugin(plugin, request, { toolRoot: context.config.toolRoot, log })
      if (context.cache && context.key) context.cache.set(plugin.id, context.key, output)
    } catch (error) {
      info.error = (error as Error).message.split('\n')[0]
      info.durationMs = Math.round(performance.now() - started)
      log.error(`plugin ${plugin.id} failed: ${(error as Error).message}`)
      return undefined
    }
  }
  info.durationMs = Math.round(performance.now() - started)
  info.nodes = output.nodes?.length ?? 0
  info.edges = output.edges?.length ?? 0
  info.facts = output.facts?.length ?? 0
  info.diagnostics = output.diagnostics?.length ?? 0
  const detail = [
    `${info.nodes} nodes`,
    `${info.edges} edges`,
    info.facts ? `${info.facts} facts` : '',
    output.unresolved?.length ? `${output.unresolved.length} unresolved` : '',
  ].filter(Boolean)
  log.step(
    `${plugin.kind === 'linker' ? 'link   ' : 'extract'} ${color.bold(plugin.id.padEnd(11))} ${detail.join(', ')} ${color.dim(
      info.cached ? '(cached)' : formatMs(info.durationMs),
    )}`,
  )
  for (const diagnostic of output.diagnostics ?? []) {
    if (diagnostic.level === 'error') log.warn(`[${plugin.id}] ${diagnostic.message}`)
    else log.debug(`[${plugin.id}] ${diagnostic.level}: ${diagnostic.message}`)
  }
  return output
}

function kindSize(kinds: KindDef[], kind: string): number {
  return kinds.find((k) => k.id === kind)?.size ?? 1
}

/** Config vocabulary + anything plugins used that config didn't declare (so new categories show up). */
function buildMeta(config: RepoMapConfig, nodes: GraphNode[], edges: GraphEdge[], toolVersion: string, publicOutput?: boolean): GraphMeta {
  const git = gitInfo(config.repoRoot)
  const layers: LayerDef[] = [...config.layers]
  const roles: RoleDef[] = [...config.roles]
  const kinds: KindDef[] = [...config.kinds]
  const edgeTypes: EdgeTypeDef[] = [...config.edgeTypes]
  for (const node of nodes) {
    if (!layers.some((l) => l.id === node.layer)) layers.push({ id: node.layer, label: titleCase(node.layer), color: autoColor(node.layer) })
    if (!roles.some((r) => r.id === node.role)) {
      const parent = node.role.includes('/') ? node.role.split('/')[0] : undefined
      if (parent && !roles.some((r) => r.id === parent)) roles.push({ id: parent, label: titleCase(parent), color: autoColor(parent), planeOffset: 20 })
      roles.push({ id: node.role, label: titleCase(node.role.split('/').pop()!), color: autoColor(node.role), parent })
    }
    if (!kinds.some((k) => k.id === node.kind)) kinds.push({ id: node.kind, label: titleCase(node.kind), color: autoColor(node.kind), shape: 'sphere', size: 0.8 })
  }
  for (const edge of edges) {
    if (!edgeTypes.some((t) => t.id === edge.type)) edgeTypes.push({ id: edge.type, label: titleCase(edge.type), color: autoColor(edge.type) })
  }
  return {
    tool: { name: 'repomap', version: toolVersion },
    repo: {
      name: config.name,
      root: publicOutput ? undefined : config.repoRoot,
      commit: git.commit,
      branch: git.branch,
      dirty: git.dirty,
    },
    generatedAt: new Date().toISOString(),
    layers,
    roles,
    kinds,
    edgeTypes,
    presets: config.presets,
    layout: { algorithm: 'layered-force', layerGap: config.layout.layerGap, seed: config.layout.seed },
  }
}

function titleCase(id: string): string {
  return id.replace(/[-_/]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function autoColor(id: string): string {
  const hue = hashString(id) % 360
  return hslToHex(hue, 0.65, 0.66)
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`
}

export function readGraph(path: string): RepoGraph | undefined {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RepoGraph
  } catch {
    return undefined
  }
}

function computeChanges(previous: RepoGraph | undefined, nodes: GraphNode[], edges: GraphEdge[]): GraphChanges | undefined {
  if (!previous) return undefined
  const before = new Set(previous.nodes.map((n) => n.id))
  const after = new Set(nodes.map((n) => n.id))
  const beforeEdges = new Set(previous.edges.map(edgeKey))
  const afterEdges = new Set(edges.map(edgeKey))
  const addedNodes = nodes.filter((n) => !before.has(n.id)).map((n) => n.id)
  const removedNodes = previous.nodes
    .filter((n) => !after.has(n.id))
    .map((n) => ({ id: n.id, label: n.label, layer: n.layer, kind: n.kind }))
  const addedEdges = [...afterEdges].filter((k) => !beforeEdges.has(k)).length
  const removedEdges = [...beforeEdges].filter((k) => !afterEdges.has(k)).length
  if (addedNodes.length + removedNodes.length + addedEdges + removedEdges === 0) return undefined
  return {
    since: previous.meta.generatedAt,
    previousCommit: previous.meta.repo.commit,
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
  }
}

function writeHistory(outDir: string, graph: RepoGraph, text: string): void {
  const dir = join(outDir, 'history')
  mkdirSync(dir, { recursive: true })
  const stamp = graph.meta.generatedAt.replace(/[:.]/g, '-')
  writeFileSync(join(dir, `${stamp}_${graph.meta.repo.commit ?? 'nogit'}.json`), text)
  const entries = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  for (const old of entries.slice(0, Math.max(0, entries.length - HISTORY_LIMIT))) rmSync(join(dir, old), { force: true })
}

/** One node/edge per line: compact, yet diff-friendly. */
export function stringifyGraph(graph: RepoGraph): string {
  const lines: string[] = ['{']
  lines.push(`"version": ${graph.version},`)
  lines.push(`"meta": ${JSON.stringify(graph.meta)},`)
  const list = (name: string, items: unknown[], last = false) => {
    lines.push(`"${name}": [`)
    items.forEach((item, i) => lines.push(`  ${JSON.stringify(item)}${i < items.length - 1 ? ',' : ''}`))
    lines.push(`]${last ? '' : ','}`)
  }
  list('nodes', graph.nodes)
  list('edges', graph.edges)
  list('unresolved', graph.unresolved, !graph.diagnostics)
  if (graph.diagnostics) list('diagnostics', graph.diagnostics, true)
  lines.push('}')
  return `${lines.join('\n')}\n`
}

function readToolVersion(toolRoot: string): string {
  try {
    return (JSON.parse(readFileSync(join(toolRoot, 'package.json'), 'utf8')) as { version: string }).version
  } catch {
    return '0.0.0'
  }
}

function summarize(graph: RepoGraph, log: Logger): void {
  const byLayer = new Map<string, number>()
  for (const node of graph.nodes) byLayer.set(node.layer, (byLayer.get(node.layer) ?? 0) + 1)
  const layers = graph.meta.layers
    .filter((l) => byLayer.has(l.id))
    .map((l) => `${l.label} ${byLayer.get(l.id)}`)
    .join(' · ')
  log.info(
    `${color.green('✔')} ${graph.nodes.length} nodes, ${graph.edges.length} edges${
      graph.unresolved.length ? `, ${color.yellow(`${graph.unresolved.length} unresolved`)}` : ''
    } ${color.dim(`(${layers})`)} in ${formatMs(graph.meta.stats?.durationMs ?? 0)}`,
  )
}
