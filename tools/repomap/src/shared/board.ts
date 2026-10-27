/**
 * The board: the map as nested levels you zoom through, like chips on circuit boards.
 *
 *   app → tiers (frontend, backend, database…) → a tier's features → a feature's chips → one chip
 *
 * A tier groups layers (the frontend's views, view models and model are one tier). A feature is a
 * vertical slice of the app (Contact, Meetings…); nodes get one from their folder (`feature:x` tags the
 * extractors add), from config or the AI, or from their neighbours; the rest are "shared". A chip is a
 * top-level node (no parent); its children (an entity's properties, a table's columns, an endpoint
 * group's endpoints, an API client's calls) are its pins, and so are the members its code declares.
 *
 * Isomorphic: used by the builder (feature assignment, rules) and by the viewer (levels).
 */
import type { GraphEdge, GraphNode, LayerDef } from './types.ts'

export interface TierDef {
  id: string
  label: string
  color: string
  /** Layers on this tier, top to bottom. */
  layers: string[]
  description?: string
}

export interface FeatureDef {
  id: string
  label: string
  color: string
}

export type FeatureSource = 'path' | 'manual' | 'llm' | 'derived' | 'shared'

export interface Summary {
  text: string
  /** Hash of what was summarized (the code, or the summaries below it). */
  hash: string
  model?: string
  at?: string
  /** The code changed since: the text may be out of date. */
  stale?: boolean
}

/** A member a chip's code declares (extractors put them in `attrs.members`). */
export interface Member {
  name: string
  kind: string
  line?: number
  endLine?: number
  type?: string
  access?: string
}

export interface RuleSelector {
  tiers?: string[]
  layers?: string[]
  features?: string[]
  kinds?: string[]
  /** Role ids; a parent role covers its children (`test` covers `test/unit`). */
  roles?: string[]
}

/**
 * An architecture rule, checked on every build. It applies to the edges from `from` to `to` (of
 * `edgeTypes`, default: every type but contains/uses-type). `deny`: each such edge is a violation.
 * `sameFeature`: each such edge must stay inside one feature (`allowFeatures` may be reached from anywhere).
 */
export interface RuleDef {
  id: string
  description: string
  severity?: 'error' | 'warn'
  edgeTypes?: string[]
  from?: RuleSelector
  to?: RuleSelector
  deny?: boolean
  sameFeature?: boolean
  allowFeatures?: string[]
}

export interface Violation {
  rule: string
  severity: 'error' | 'warn'
  from: string
  to: string
  type: string
  message: string
  evidence?: { file: string; line?: number }
}

export interface BoardData {
  tiers: TierDef[]
  features: FeatureDef[]
  /** Keys: a node id, `app`, `tier:<tier>`, `feature:<feature>@<tier>`. */
  summaries?: Record<string, Summary>
  rules?: RuleDef[]
  violations?: Violation[]
}

export const SHARED_FEATURE = 'shared'

/** Distinct, readable hues for features (on dark and light boards). */
export const FEATURE_COLORS = [
  '#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#facc15', '#f87171', '#818cf8', '#4ade80', '#fda4af', '#67e8f9',
  '#fbbf24', '#a78bfa', '#34d399', '#f9a8d4', '#93c5fd', '#fca5a5', '#86efac', '#fdba74',
]

/** "workWithMe", "Work-With-Me" → "workwithme". */
export function featureKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** The feature an extractor tagged the node with (`feature:x`). */
export function taggedFeature(node: GraphNode): string | undefined {
  const tag = node.tags?.find((t) => t.startsWith('feature:'))
  return tag ? featureKey(tag.slice('feature:'.length)) : undefined
}

/** Tiers from config, or one per layer; layers no tier names get their own. */
export function resolveTiers(layers: LayerDef[], configured: TierDef[] | undefined): TierDef[] {
  const tiers = (configured ?? []).map((t) => ({ ...t, layers: t.layers.filter((l) => layers.some((x) => x.id === l)) })).filter((t) => t.layers.length > 0)
  for (const layer of layers) {
    if (tiers.some((t) => t.layers.includes(layer.id))) continue
    tiers.push({ id: layer.id, label: layer.label, color: layer.color, layers: [layer.id], description: layer.description })
  }
  // Keep the layers' order: a tier sits where its first layer is.
  const order = (t: TierDef) => Math.min(...t.layers.map((l) => layers.findIndex((x) => x.id === l)))
  return tiers.sort((a, b) => order(a) - order(b))
}

/** Edge types that say nothing about which feature a node belongs to. */
const NO_VOTE = new Set(['contains', 'exposes', 'registers', 'depends-on', 'configures', 'migrates', 'navigates'])

export interface AssignOptions {
  /** feature key → the feature it stands for (e.g. whatsnew → updates). */
  aliases?: Record<string, string>
  /** Set by config (globs resolved by the builder): wins over everything. */
  manual?: Map<string, string>
  /** Set by the AI for nodes nothing else placed. */
  llm?: Map<string, string>
  /** Share of a node's neighbours that must agree before it joins their feature (default 0.6). */
  agreement?: number
}

/**
 * Gives every node a feature: config, then its folder, then the AI, then its parent, then (repeatedly)
 * the feature most of its neighbours share; the rest is shared. Children follow their parent unless
 * they have their own (an API client's calls each belong to their feature).
 */
export function assignFeatures(nodes: GraphNode[], edges: GraphEdge[], options: AssignOptions = {}): Map<string, { feature: string; source: FeatureSource }> {
  const alias = (key: string) => {
    const k = featureKey(key)
    const target = options.aliases?.[k]
    return target ? featureKey(target) : k
  }
  const result = new Map<string, { feature: string; source: FeatureSource }>()
  for (const node of nodes) {
    const manual = options.manual?.get(node.id)
    if (manual) {
      result.set(node.id, { feature: alias(manual), source: 'manual' })
      continue
    }
    const tagged = taggedFeature(node)
    if (tagged) {
      result.set(node.id, { feature: alias(tagged), source: 'path' })
      continue
    }
    const llm = options.llm?.get(node.id)
    if (llm) result.set(node.id, { feature: alias(llm), source: 'llm' })
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const fromParent = (node: GraphNode) => {
    let parent = node.parent ? byId.get(node.parent) : undefined
    while (parent) {
      const assigned = result.get(parent.id)
      if (assigned) return assigned.feature
      parent = parent.parent ? byId.get(parent.parent) : undefined
    }
    return undefined
  }
  for (const node of nodes) {
    if (result.has(node.id)) continue
    const feature = fromParent(node)
    if (feature) result.set(node.id, { feature, source: 'derived' })
  }

  // Neighbours vote, in rounds (a node placed in one round votes in the next).
  const neighbours = new Map<string, { id: string; weight: number }[]>()
  const link = (a: string, b: string, weight: number) => {
    if (!neighbours.has(a)) neighbours.set(a, [])
    neighbours.get(a)!.push({ id: b, weight })
  }
  for (const edge of edges) {
    if (NO_VOTE.has(edge.type) || edge.from === edge.to) continue
    const weight = edge.type === 'uses-type' || edge.type === 'mirrors' ? 0.5 : 1
    link(edge.from, edge.to, weight)
    // Tests take their subject's feature; they don't place their subject.
    if (edge.type !== 'tests' && edge.type !== 'mocks') link(edge.to, edge.from, weight)
  }
  const agreement = options.agreement ?? 0.6
  for (let round = 0; round < 4; round++) {
    const placed: [string, string][] = []
    for (const node of nodes) {
      if (result.has(node.id)) continue
      const votes = new Map<string, number>()
      let total = 0
      for (const { id, weight } of neighbours.get(node.id) ?? []) {
        const assigned = result.get(id)
        if (!assigned || assigned.feature === SHARED_FEATURE) continue
        votes.set(assigned.feature, (votes.get(assigned.feature) ?? 0) + weight)
        total += weight
      }
      let best: string | undefined
      let bestVotes = 0
      for (const [feature, count] of votes) if (count > bestVotes || (count === bestVotes && best !== undefined && feature < best)) [best, bestVotes] = [feature, count]
      if (best && bestVotes / total >= agreement) placed.push([node.id, best])
    }
    if (placed.length === 0) break
    for (const [id, feature] of placed) result.set(id, { feature, source: 'derived' })
    // Children of a newly placed node follow it.
    for (const node of nodes) {
      if (result.has(node.id)) continue
      const feature = fromParent(node)
      if (feature) result.set(node.id, { feature, source: 'derived' })
    }
  }
  for (const node of nodes) if (!result.has(node.id)) result.set(node.id, { feature: SHARED_FEATURE, source: 'shared' })
  return result
}

/** Feature definitions for the keys in use: labels from config, else title case; shared last, grey. */
export function featureDefs(keys: Iterable<string>, labels: Record<string, string> = {}): FeatureDef[] {
  const sorted = [...new Set(keys)].filter((k) => k !== SHARED_FEATURE).sort()
  const defs = sorted.map((id, i) => ({ id, label: labels[id] ?? titleCase(id), color: FEATURE_COLORS[i % FEATURE_COLORS.length] }))
  defs.push({ id: SHARED_FEATURE, label: labels[SHARED_FEATURE] ?? 'Shared', color: '#94a3b8' })
  return defs
}

function titleCase(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/** The members an extractor listed for a node (`attrs.members`). */
export function membersOf(node: GraphNode): Member[] {
  const members = node.attrs?.members
  return Array.isArray(members) ? (members as Member[]).filter((m) => m && typeof m.name === 'string') : []
}

/** The member of `node` whose code holds `line` (the innermost one declared before it). */
export function memberAt(node: GraphNode, line: number | undefined): Member | undefined {
  if (line === undefined) return undefined
  let found: Member | undefined
  for (const member of membersOf(node)) {
    if (member.line === undefined || member.line > line) continue
    if (member.endLine !== undefined && member.endLine < line) continue
    if (member.endLine === undefined && member.line !== line) continue
    if (!found || member.line >= (found.line ?? 0)) found = member
  }
  return found
}

// ---------------------------------------------------------------- rules

/** Edge types rules skip unless they name them. */
const RULE_SKIP = new Set(['contains', 'uses-type'])

export function roleCovers(roles: string[], role: string): boolean {
  return roles.some((r) => role === r || role.startsWith(`${r}/`))
}

function matchesSelector(selector: RuleSelector | undefined, node: GraphNode, tier: string | undefined, feature: string | undefined): boolean {
  if (!selector) return true
  const any = (list: string[] | undefined, value: string | undefined) => !list || list.includes('*') || (value !== undefined && list.includes(value))
  return (
    any(selector.tiers, tier) &&
    any(selector.layers, node.layer) &&
    any(selector.features, feature) &&
    any(selector.kinds, node.kind) &&
    (!selector.roles || roleCovers(selector.roles, node.role))
  )
}

/** The edges that break the rules (nodes need `feature` set; tiers map layers). */
export function checkRules(nodes: GraphNode[], edges: GraphEdge[], tiers: TierDef[], rules: RuleDef[], featureOf: (id: string) => string | undefined): Violation[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const tierOf = new Map<string, string>()
  for (const tier of tiers) for (const layer of tier.layers) tierOf.set(layer, tier.id)
  const violations: Violation[] = []
  for (const rule of rules) {
    const severity = rule.severity ?? 'warn'
    for (const edge of edges) {
      if (rule.edgeTypes ? !rule.edgeTypes.includes(edge.type) : RULE_SKIP.has(edge.type)) continue
      const from = byId.get(edge.from)
      const to = byId.get(edge.to)
      if (!from || !to) continue
      const fromFeature = featureOf(from.id)
      const toFeature = featureOf(to.id)
      if (!matchesSelector(rule.from, from, tierOf.get(from.layer), fromFeature)) continue
      if (!matchesSelector(rule.to, to, tierOf.get(to.layer), toFeature)) continue
      let message: string | undefined
      if (rule.deny) message = `${from.label} → ${to.label} (${edge.type}) is not allowed`
      else if (rule.sameFeature && fromFeature !== toFeature) {
        const allowed = [SHARED_FEATURE, ...(rule.allowFeatures ?? [])]
        if (!allowed.includes(toFeature ?? '') && !allowed.includes(fromFeature ?? '')) {
          message = `${from.label} (${fromFeature}) → ${to.label} (${toFeature}) crosses features`
        }
      }
      if (!message) continue
      const evidence = edge.evidence?.[0]
      violations.push({ rule: rule.id, severity, from: edge.from, to: edge.to, type: edge.type, message, ...(evidence ? { evidence } : {}) })
    }
  }
  return violations
}

// ---------------------------------------------------------------- summaries

/** Roles the board hides unless asked (and the AI doesn't summarize). */
export const BOARD_HIDDEN_ROLES = ['test', 'config', 'migration', 'generated', 'tooling', 'docs']

/** Kinds whose code says it all (types, contracts): no AI summary. */
export const NO_SUMMARY_KINDS = new Set(['interface', 'type', 'enum', 'dto', 'file', 'doc', 'snapshot', 'stylesheet', 'html', 'http-file', 'config-file', 'project', 'script', 'workflow', 'migration'])

export const summaryKey = {
  app: () => 'app',
  tier: (tier: string) => `tier:${tier}`,
  feature: (feature: string, tier: string) => `feature:${feature}@${tier}`,
}

/** Whether the AI summarizes a node: a production chip (no parent) whose kind isn't a plain type. */
export function summarizable(node: GraphNode): boolean {
  return !node.parent && !roleCovers(BOARD_HIDDEN_ROLES, node.role) && !NO_SUMMARY_KINDS.has(node.kind)
}
