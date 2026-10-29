/**
 * The builder's side of the Board: tiers, each node's feature, AI results (placements, summaries, kept
 * in repomap.ai.json) marked stale when the code changed, and the architecture rules' violations.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  architecturePlace,
  assignFeatures,
  checkRules,
  featureDefs,
  featureKey,
  resolveTiers,
  summarizable,
  summaryKey,
  type BoardData,
  type RuleDef,
  type Summary,
  type TierDef,
} from '../shared/board.ts'
import type { GraphEdge, GraphNode, LayerDef } from '../shared/types.ts'
import { sha256 } from './cache.ts'
import type { RepoMapConfig } from './config.ts'
import { matcher } from './files.ts'

/** repomap.ai.json: what the AI produced, reused while the code it read is unchanged. */
export interface AiFile {
  version: 1
  /** Node id → the feature the AI placed it in (nodes no folder, config or neighbour placed). */
  features: Record<string, { feature: string; reason?: string; hash?: string }>
  /** Summary key (see summaryKey) → summary. */
  summaries: Record<string, Summary>
  /** Rules the AI suggested (not checked until copied into the config's `rules`). */
  suggestedRules?: RuleDef[]
}

export function readAiFile(path: string): AiFile {
  const empty: AiFile = { version: 1, features: {}, summaries: {} }
  if (!existsSync(path)) return empty
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<AiFile>
    return { ...empty, ...data, features: data.features ?? {}, summaries: data.summaries ?? {} }
  } catch {
    return empty
  }
}

/** Sorted keys, one entry per line: diffs of the committed file stay readable. */
export function writeAiFile(path: string, data: AiFile): void {
  const sortObject = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
  const out = { version: 1, features: sortObject(data.features), summaries: sortObject(data.summaries), ...(data.suggestedRules ? { suggestedRules: data.suggestedRules } : {}) }
  writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`)
}

/** Reads a repo file's text, caching it (undefined when it can't be read). */
function sourceReader(repoRoot: string): (file: string) => string | undefined {
  const files = new Map<string, string | undefined>()
  return (file) => {
    if (!files.has(file)) {
      try {
        files.set(file, readFileSync(join(repoRoot, file), 'utf8'))
      } catch {
        files.set(file, undefined)
      }
    }
    return files.get(file)
  }
}

/** Reads a node's code (its lines), caching files. */
export function codeReader(repoRoot: string): (node: GraphNode) => string | undefined {
  const files = new Map<string, string[] | null>()
  return (node) => {
    if (!node.file) return undefined
    if (!files.has(node.file)) {
      try {
        files.set(node.file, readFileSync(join(repoRoot, node.file), 'utf8').split('\n'))
      } catch {
        files.set(node.file, null)
      }
    }
    const lines = files.get(node.file)
    if (!lines) return undefined
    const start = Math.max(1, node.line ?? 1)
    const end = node.endLine ?? (node.line ? node.line : lines.length)
    return lines.slice(start - 1, end).join('\n')
  }
}

export interface SummaryTarget {
  key: string
  level: 'chip' | 'feature' | 'tier' | 'app'
  hash: string
  /** chip: the node; feature/tier/app: the keys it is summarized from. */
  node?: GraphNode
  tier?: string
  feature?: string
  parts: string[]
}

/**
 * What the AI summarizes, bottom-up, each with the hash of what it reads: a chip's code (and its pins),
 * a feature's chips on a tier, a tier's features, the app's tiers. Nodes need `feature` set.
 */
export function summaryTargets(nodes: GraphNode[], tiers: TierDef[], code: (node: GraphNode) => string | undefined): SummaryTarget[] {
  const tierOf = new Map<string, string>()
  for (const tier of tiers) for (const layer of tier.layers) tierOf.set(layer, tier.id)
  const childLabels = new Map<string, string[]>()
  for (const node of nodes) if (node.parent) (childLabels.get(node.parent) ?? childLabels.set(node.parent, []).get(node.parent)!).push(node.label)
  const targets: SummaryTarget[] = []
  const byFeature = new Map<string, SummaryTarget[]>()
  for (const node of nodes) {
    if (!summarizable(node)) continue
    const source = code(node) ?? JSON.stringify([node.label, node.kind, node.attrs ?? {}])
    const target: SummaryTarget = { key: node.id, level: 'chip', node, hash: sha256([source, ...(childLabels.get(node.id) ?? [])].join('\n')).slice(0, 16), parts: [] }
    targets.push(target)
    const tier = tierOf.get(node.layer)
    if (!tier || !node.feature) continue
    const key = summaryKey.feature(node.feature, tier)
    if (!byFeature.has(key)) byFeature.set(key, [])
    byFeature.get(key)!.push(target)
  }
  const roll = (parts: SummaryTarget[]) => sha256(parts.map((p) => `${p.key}=${p.hash}`).sort().join('\n')).slice(0, 16)
  const byTier = new Map<string, SummaryTarget[]>()
  for (const [key, chips] of [...byFeature].sort(([a], [b]) => a.localeCompare(b))) {
    const [feature, tier] = key.slice('feature:'.length).split('@')
    const target: SummaryTarget = { key, level: 'feature', tier, feature, hash: roll(chips), parts: chips.map((c) => c.key) }
    targets.push(target)
    if (!byTier.has(tier)) byTier.set(tier, [])
    byTier.get(tier)!.push(target)
  }
  const tierTargets: SummaryTarget[] = []
  for (const tier of tiers) {
    const features = byTier.get(tier.id)
    if (!features) continue
    const target: SummaryTarget = { key: summaryKey.tier(tier.id), level: 'tier', tier: tier.id, hash: roll(features), parts: features.map((f) => f.key) }
    targets.push(target)
    tierTargets.push(target)
  }
  if (tierTargets.length > 0) targets.push({ key: summaryKey.app(), level: 'app', hash: roll(tierTargets), parts: tierTargets.map((t) => t.key) })
  return targets
}

/** Node ids (exact) or globs over node files → feature. */
function manualFeatures(nodes: GraphNode[], overrides: Record<string, string>): Map<string, string> {
  const result = new Map<string, string>()
  const ids = new Set(nodes.map((n) => n.id))
  const globs = Object.entries(overrides).filter(([key]) => !ids.has(key))
  const matchers = globs.map(([glob, feature]) => [matcher([glob]), feature] as const)
  for (const node of nodes) {
    const exact = overrides[node.id]
    if (exact && ids.has(node.id)) {
      result.set(node.id, exact)
      continue
    }
    if (!node.file) continue
    for (const [matches, feature] of matchers) {
      if (matches(node.file)) {
        result.set(node.id, feature)
        break
      }
    }
  }
  return result
}

/** Sets each node's feature and returns the Board's data (summaries marked stale where the code changed). */
export function buildBoard(config: RepoMapConfig, nodes: GraphNode[], edges: GraphEdge[], layers: LayerDef[]): BoardData {
  const tiers = resolveTiers(layers, config.board.tiers)
  const ai = readAiFile(config.ai.file)
  const llm = new Map(Object.entries(ai.features).map(([id, entry]) => [id, entry.feature]))
  const architectures = config.board.architectures ?? []
  const places = new Map(nodes.flatMap((n) => {
    const place = architecturePlace(n.file, architectures)
    return place ? [[n.id, place] as const] : []
  }))
  // A folder's feature tag that names a slice of the tier's architecture is that slice (backend tests in Features/Apps).
  const tierOfLayer = new Map(tiers.flatMap((t) => t.layers.map((l) => [l, t.id] as const)))
  const slices = new Map<string, Map<string, string>>()
  for (const arch of architectures) {
    const keys = slices.get(arch.tier) ?? slices.set(arch.tier, new Map()).get(arch.tier)!
    for (const place of places.values()) if (place.architecture === arch.id && place.part && !keys.has(featureKey(place.part))) keys.set(featureKey(place.part), place.feature)
  }
  const assigned = assignFeatures(nodes, edges, {
    sliceFor: (node, key) => slices.get(tierOfLayer.get(node.layer) ?? '')?.get(key),
    aliases: config.board.featureAliases,
    manual: manualFeatures(nodes, config.board.featureOverrides),
    placed: new Map([...places].map(([id, place]) => [id, place.feature])),
    hubs: config.board.hubFeatures,
    llm,
  })
  for (const node of nodes) {
    const entry = assigned.get(node.id)!
    node.feature = entry.feature
    node.featureSource = entry.source
  }
  const features = featureDefs(
    nodes.map((n) => n.feature!),
    config.board.featureLabels,
    architectures,
  )
  const summaries: Record<string, Summary> = {}
  for (const target of summaryTargets(nodes, tiers, codeReader(config.repoRoot))) {
    const stored = ai.summaries[target.key]
    if (!stored) continue
    summaries[target.key] = stored.hash === target.hash ? { ...stored, stale: undefined } : { ...stored, stale: true }
    if (!summaries[target.key].stale) delete summaries[target.key].stale
  }
  const featureOf = new Map(nodes.map((n) => [n.id, n.feature]))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const source = sourceReader(config.repoRoot)
  const violations = checkRules(nodes, edges, tiers, config.rules, (id) => featureOf.get(id), {
    placeOf: (id) => places.get(id),
    // A slice reaching another through the folder that slice keeps for it (FSD: entities/session/@x/site.ts).
    allowCrossing: (edge, from, to) => {
      const via = architectures.find((a) => a.id === from.architecture)?.crossImports
      const file = edge.evidence?.[0]?.file ?? byId.get(edge.from)?.file
      return !!via && !!file && (source(file) ?? '').includes(`${to.layer}/${to.part}/${via}/${from.part}`)
    },
  })
  const board: BoardData = { tiers, features, ...(architectures.length > 0 ? { architectures } : {}) }
  if (Object.keys(summaries).length > 0) board.summaries = summaries
  if (config.rules.length > 0) {
    board.rules = config.rules
    board.violations = violations
  }
  return board
}
