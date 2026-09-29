/**
 * Filtering: every layer, kind (per layer), role, edge type and edge source can be shown, dimmed or
 * hidden. A node's visibility is the most restrictive of its layer, kind and role (and the role's
 * parents); an edge is only as visible as its least visible end. Positions never change.
 */
import type { FilterSpec, Visibility } from '../../../src/shared/types.ts'
import type { GraphIndex } from './graph.ts'

export const HIDE = 0
export const DIM = 1
export const SHOW = 2
export type Level = 0 | 1 | 2

const RANK: Record<Visibility, Level> = { hide: HIDE, dim: DIM, show: SHOW }

export interface FilterState {
  layers: Record<string, Visibility>
  /** key: `${layer}/${kind}` */
  kinds: Record<string, Visibility>
  roles: Record<string, Visibility>
  edgeTypes: Record<string, Visibility>
  sources: Record<string, Visibility>
  minConfidence: number
  hideOrphans: boolean
  /** Show edges of hidden children on their visible parent (e.g. column FKs as table → table). */
  rollUp: boolean
  showUnresolved: boolean
}

export function everything(): FilterState {
  return { layers: {}, kinds: {}, roles: {}, edgeTypes: {}, sources: {}, minConfidence: 0, hideOrphans: false, rollUp: true, showUnresolved: true }
}

export function kindKey(layer: string, kind: string): string {
  return `${layer}/${kind}`
}

/** Expands a preset (with "*" wildcards, plain kind ids, parent roles) into an explicit filter state. */
export function fromPreset(spec: FilterSpec, index: GraphIndex, base: FilterState = everything()): FilterState {
  const fallback = spec.default ?? 'show'
  const pick = (map: Record<string, Visibility> | undefined, ...keys: string[]): Visibility => {
    for (const key of keys) if (map?.[key]) return map[key]
    return map?.['*'] ?? fallback
  }
  const state: FilterState = { ...everything(), rollUp: base.rollUp, showUnresolved: base.showUnresolved, hideOrphans: base.hideOrphans }
  for (const layer of index.layers) setIfNotShow(state.layers, layer.id, pick(spec.layers, layer.id))
  for (const [layer, kinds] of index.layerKinds) {
    for (const kind of kinds) setIfNotShow(state.kinds, kindKey(layer, kind), pick(spec.kinds, kindKey(layer, kind), kind))
  }
  for (const role of index.roles.keys()) {
    const explicit = spec.roles?.[role] ?? spec.roles?.['*']
    if (explicit && explicit !== 'show') state.roles[role] = explicit
  }
  for (const type of index.edgeTypes.keys()) setIfNotShow(state.edgeTypes, type, spec.edgeTypes?.[type] ?? spec.edgeTypes?.['*'] ?? 'show')
  for (const source of ['static', 'llm', 'manual']) setIfNotShow(state.sources, source, spec.sources?.[source] ?? 'show')
  state.minConfidence = spec.minConfidence ?? 0
  return state
}

function setIfNotShow(map: Record<string, Visibility>, key: string, value: Visibility) {
  if (value !== 'show') map[key] = value
}

export function sameFilters(a: FilterState, b: FilterState): boolean {
  const same = (x: Record<string, Visibility>, y: Record<string, Visibility>) => {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)])
    for (const key of keys) if ((x[key] ?? 'show') !== (y[key] ?? 'show')) return false
    return true
  }
  return (
    same(a.layers, b.layers) &&
    same(a.kinds, b.kinds) &&
    same(a.roles, b.roles) &&
    same(a.edgeTypes, b.edgeTypes) &&
    same(a.sources, b.sources) &&
    a.minConfidence === b.minConfidence &&
    a.hideOrphans === b.hideOrphans
  )
}

export interface Visibilities {
  nodes: Uint8Array
  edges: Uint8Array
}

/** Effective role level: the most restrictive of the role and its parents. */
function roleLevels(index: GraphIndex, filters: FilterState): Map<string, Level> {
  const levels = new Map<string, Level>()
  for (const [role, chain] of index.roleChain) {
    let level: Level = SHOW
    for (const r of chain) level = Math.min(level, RANK[filters.roles[r] ?? 'show']) as Level
    levels.set(role, level)
  }
  return levels
}

export function computeVisibility(index: GraphIndex, filters: FilterState): Visibilities {
  const n = index.nodes.length
  const nodes = new Uint8Array(n)
  const roles = roleLevels(index, filters)
  for (let i = 0; i < n; i++) {
    const node = index.nodes[i]
    const layer = RANK[filters.layers[node.layer] ?? 'show']
    const kind = RANK[filters.kinds[kindKey(node.layer, node.kind)] ?? 'show']
    nodes[i] = Math.min(layer, kind, roles.get(node.role) ?? SHOW)
  }
  const edges = new Uint8Array(index.edges.length)
  const computeEdges = () => {
    for (let e = 0; e < index.edges.length; e++) {
      const edge = index.edges[e]
      if (edge.confidence < filters.minConfidence) {
        edges[e] = HIDE
        continue
      }
      const type = RANK[filters.edgeTypes[edge.type] ?? 'show']
      const source = RANK[filters.sources[edge.source] ?? 'show']
      edges[e] = Math.min(nodes[index.edgeFrom[e]], nodes[index.edgeTo[e]], type, source)
    }
  }
  computeEdges()
  if (filters.hideOrphans) {
    const connected = new Uint8Array(n)
    for (let e = 0; e < index.edges.length; e++) {
      if (edges[e] === HIDE || index.edges[e].type === 'contains') continue
      connected[index.edgeFrom[e]] = 1
      connected[index.edgeTo[e]] = 1
    }
    for (let i = 0; i < n; i++) if (!connected[i]) nodes[i] = HIDE
    computeEdges()
  }
  return { nodes, edges }
}

/** Nearest visible ancestor of a hidden node, or -1. */
export function visibleAncestor(index: GraphIndex, visibility: Uint8Array, i: number): number {
  let current = index.parent[i]
  let guard = 0
  while (current >= 0 && guard++ < 32) {
    if (visibility[current] !== HIDE) return current
    current = index.parent[current]
  }
  return -1
}

export interface RolledEdge {
  from: number
  to: number
  type: string
  level: Level
  count: number
}

/** Edges whose ends are hidden children, lifted to their visible ancestors (deduplicated). */
export function rollUpEdges(index: GraphIndex, filters: FilterState, visibility: Visibilities): RolledEdge[] {
  if (!filters.rollUp) return []
  const rolled = new Map<string, RolledEdge>()
  for (let e = 0; e < index.edges.length; e++) {
    if (visibility.edges[e] !== HIDE) continue
    const edge = index.edges[e]
    if (edge.type === 'contains' || edge.confidence < filters.minConfidence) continue
    const typeLevel = RANK[filters.edgeTypes[edge.type] ?? 'show']
    const sourceLevel = RANK[filters.sources[edge.source] ?? 'show']
    if (typeLevel === HIDE || sourceLevel === HIDE) continue
    let from = index.edgeFrom[e]
    let to = index.edgeTo[e]
    if (visibility.nodes[from] === HIDE) from = visibleAncestor(index, visibility.nodes, from)
    if (visibility.nodes[to] === HIDE) to = visibleAncestor(index, visibility.nodes, to)
    if (from < 0 || to < 0 || from === to) continue
    if (from === index.edgeFrom[e] && to === index.edgeTo[e]) continue
    const key = `${from}|${edge.type}|${to}`
    const level = Math.min(visibility.nodes[from], visibility.nodes[to], typeLevel, sourceLevel) as Level
    const existing = rolled.get(key)
    if (existing) existing.count++
    else rolled.set(key, { from, to, type: edge.type, level, count: 1 })
  }
  return [...rolled.values()]
}

export interface Count {
  shown: number
  total: number
}

export interface Counts {
  layers: Map<string, Count>
  kinds: Map<string, Count>
  roles: Map<string, Count>
  edgeTypes: Map<string, Count>
  sources: Map<string, Count>
  nodesShown: number
  edgesShown: number
}

export function computeCounts(index: GraphIndex, visibility: Visibilities): Counts {
  const bump = (map: Map<string, Count>, key: string, shown: boolean) => {
    const count = map.get(key) ?? { shown: 0, total: 0 }
    count.total++
    if (shown) count.shown++
    map.set(key, count)
  }
  const counts: Counts = { layers: new Map(), kinds: new Map(), roles: new Map(), edgeTypes: new Map(), sources: new Map(), nodesShown: 0, edgesShown: 0 }
  index.nodes.forEach((node, i) => {
    const shown = visibility.nodes[i] !== HIDE
    if (shown) counts.nodesShown++
    bump(counts.layers, node.layer, shown)
    bump(counts.kinds, kindKey(node.layer, node.kind), shown)
    for (const role of index.roleChain.get(node.role) ?? [node.role]) bump(counts.roles, role, shown)
  })
  index.edges.forEach((edge, e) => {
    const shown = visibility.edges[e] !== HIDE
    if (shown) counts.edgesShown++
    bump(counts.edgeTypes, edge.type, shown)
    bump(counts.sources, edge.source, shown)
  })
  return counts
}

export function nextVisibility(current: Visibility): Visibility {
  return current === 'hide' ? 'show' : 'hide'
}
