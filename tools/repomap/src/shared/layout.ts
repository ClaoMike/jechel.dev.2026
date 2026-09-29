/**
 * Deterministic layered layout.
 *
 * - Every layer is a horizontal plane (y is fixed per layer); roles like tests/config sit on thin
 *   sub-planes just below their layer, so hiding them never leaves holes in the production layout.
 * - x/z come from one 2D force simulation over all nodes: repulsion and collision act only inside a
 *   plane, while edges between planes pull in x/z only, so page → endpoint → table chains stack
 *   vertically. Nodes of the same feature (tag `feature:<name>`) share an anchor across layers.
 * - Same input + seed → same output. Passing the previous positions warm-starts the simulation and
 *   holds existing nodes near where they were, so rebuilding barely moves anything.
 */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { hashString, seededRandom } from './rng.ts'

export type Vec3 = [number, number, number]

export interface LayoutNode {
  id: string
  layer: string
  role: string
  parent?: string
  tags?: string[]
  /** Relative size (1 = default); bigger nodes get more room. */
  size?: number
}

export interface LayoutEdge {
  from: string
  to: string
  type: string
}

export interface LayoutOptions {
  /** Layer ids from top to bottom. */
  layers: string[]
  /** Role id → distance of its sub-plane below the layer plane. Unlisted roles use their parent's. */
  roleOffsets: Record<string, number>
  /** Role id → parent role id (for offset inheritance). */
  roleParents?: Record<string, string>
  /** Layers whose nodes all sit on the main plane regardless of role. */
  flatLayers?: string[]
  layerGap?: number
  seed?: number
  /** Positions from a previous run, used to keep the picture stable. */
  previous?: ReadonlyMap<string, Vec3>
  iterations?: number
}

interface SimNode extends SimulationNodeDatum {
  id: string
  group: string
  radius: number
  anchor?: { x: number; y: number }
  previous?: { x: number; y: number }
}

type SimLink = SimulationLinkDatum<SimNode> & { distance: number; strength: number }

const DEFAULT_GAP = 90

export function layerHeights(layers: string[], layerGap = DEFAULT_GAP): Map<string, number> {
  const heights = new Map<string, number>()
  const top = ((layers.length - 1) * layerGap) / 2
  layers.forEach((layer, index) => heights.set(layer, round(top - index * layerGap)))
  return heights
}

export function roleOffset(
  role: string,
  options: Pick<LayoutOptions, 'roleOffsets' | 'roleParents' | 'flatLayers'>,
  layer?: string,
): number {
  if (layer && options.flatLayers?.includes(layer)) return 0
  let current: string | undefined = role
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const offset = options.roleOffsets[current]
    if (offset !== undefined) return offset
    current = options.roleParents?.[current]
  }
  return 0
}

export function computeLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options: LayoutOptions,
): Map<string, Vec3> {
  const seed = options.seed ?? 1
  const gap = options.layerGap ?? DEFAULT_GAP
  const heights = layerHeights(options.layers, gap)
  const fallbackHeight = round(-((options.layers.length + 1) * gap) / 2)
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const previous = options.previous ?? new Map<string, Vec3>()

  // ---- Feature anchors: the same feature name gets the same x/z in every layer.
  const features = [...new Set(sorted.map(featureOf).filter((f): f is string => !!f))].sort()
  const anchorRadius = 18 + 14 * Math.sqrt(features.length)
  const anchors = new Map<string, { x: number; y: number }>()
  features.forEach((feature, index) => {
    const angle = (index / Math.max(1, features.length)) * Math.PI * 2 + 0.6
    anchors.set(feature, { x: Math.cos(angle) * anchorRadius, y: Math.sin(angle) * anchorRadius })
  })

  // ---- Simulation nodes.
  const simNodes: SimNode[] = sorted.map((node) => {
    const offset = roleOffset(node.role, options, node.layer)
    const feature = featureOf(node)
    const prev = previous.get(node.id)
    return {
      id: node.id,
      group: `${node.layer}|${offset}`,
      radius: 1.6 * (node.size ?? 1) + 1.6,
      anchor: feature ? anchors.get(feature) : undefined,
      previous: prev ? { x: prev[0], y: prev[2] } : undefined,
    }
  })
  const byId = new Map(simNodes.map((n) => [n.id, n]))
  const parentOf = new Map(sorted.filter((n) => n.parent).map((n) => [n.id, n.parent!]))

  // ---- Links (one per node pair, strongest type wins).
  const degree = new Map<string, number>()
  const pairs = new Map<string, { a: string; b: string; contains: boolean }>()
  for (const edge of edges) {
    if (edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to)) continue
    const [a, b] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from]
    const key = `${a}\u0000${b}`
    const existing = pairs.get(key)
    const contains = edge.type === 'contains'
    if (existing) {
      existing.contains ||= contains
      continue
    }
    pairs.set(key, { a, b, contains })
    degree.set(a, (degree.get(a) ?? 0) + 1)
    degree.set(b, (degree.get(b) ?? 0) + 1)
  }
  // Parent links even when no explicit `contains` edge was emitted.
  for (const [child, parent] of parentOf) {
    if (!byId.has(parent)) continue
    const [a, b] = child < parent ? [child, parent] : [parent, child]
    const key = `${a}\u0000${b}`
    const existing = pairs.get(key)
    if (existing) existing.contains = true
    else {
      pairs.set(key, { a, b, contains: true })
      degree.set(a, (degree.get(a) ?? 0) + 1)
      degree.set(b, (degree.get(b) ?? 0) + 1)
    }
  }
  const links: SimLink[] = [...pairs.entries()]
    .sort(([k1], [k2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : 0))
    .map(([, pair]) => {
      const source = byId.get(pair.a)!
      const target = byId.get(pair.b)!
      const samePlane = source.group === target.group
      const hub = Math.sqrt(Math.min(degree.get(pair.a) ?? 1, degree.get(pair.b) ?? 1))
      if (pair.contains) {
        return { source, target, distance: source.radius + target.radius + 1.5, strength: 0.7 }
      }
      return samePlane
        ? { source, target, distance: 16 + source.radius + target.radius, strength: 0.35 / hub }
        : { source, target, distance: 0, strength: 0.14 / hub }
    })

  // ---- Initial positions: previous run → parent/neighbours → feature anchor → phyllotaxis spiral.
  const neighbours = new Map<string, SimNode[]>()
  for (const link of links) {
    const s = link.source as SimNode
    const t = link.target as SimNode
    if (!neighbours.has(s.id)) neighbours.set(s.id, [])
    if (!neighbours.has(t.id)) neighbours.set(t.id, [])
    neighbours.get(s.id)!.push(t)
    neighbours.get(t.id)!.push(s)
  }
  const warm = simNodes.filter((n) => n.previous).length >= simNodes.length * 0.5 && simNodes.length > 0
  const unplaced: SimNode[] = []
  simNodes.forEach((node) => {
    if (node.previous) {
      node.x = node.previous.x
      node.y = node.previous.y
    } else {
      unplaced.push(node)
    }
  })
  unplaced.forEach((node, index) => {
    const jitter = hashString(node.id)
    const jx = ((jitter & 0xffff) / 0xffff - 0.5) * 6
    const jy = ((jitter >>> 16) / 0xffff - 0.5) * 6
    const placedNeighbours = (neighbours.get(node.id) ?? []).filter((n) => n.x !== undefined)
    if (placedNeighbours.length > 0) {
      node.x = placedNeighbours.reduce((sum, n) => sum + n.x!, 0) / placedNeighbours.length + jx
      node.y = placedNeighbours.reduce((sum, n) => sum + n.y!, 0) / placedNeighbours.length + jy
    } else if (node.anchor) {
      node.x = node.anchor.x + jx * 2
      node.y = node.anchor.y + jy * 2
    } else {
      const radius = 6 * Math.sqrt(index + 0.5)
      const angle = index * Math.PI * (3 - Math.sqrt(5))
      node.x = radius * Math.cos(angle)
      node.y = radius * Math.sin(angle)
    }
  })

  // ---- Forces.
  const groups = new Map<string, SimNode[]>()
  for (const node of simNodes) {
    if (!groups.has(node.group)) groups.set(node.group, [])
    groups.get(node.group)!.push(node)
  }

  // Gravity toward the shared center (so planes stay aligned); loosely connected nodes get more of it,
  // otherwise isolated files drift to the edges and blow up the planes.
  const gravity = (n: SimNode) => {
    const d = degree.get(n.id) ?? 0
    return n.anchor ? 0.05 : d === 0 ? 0.09 : d === 1 ? 0.04 : 0.02
  }
  const simulation = forceSimulation<SimNode>(simNodes)
    .randomSource(seededRandom(seed ^ 0x9e3779b9))
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .distance((l) => l.distance)
        .strength((l) => l.strength)
        .iterations(2),
    )
    .force('charge', perGroup(groups, () => forceManyBody<SimNode>().strength(-55).distanceMax(140)))
    .force('collide', perGroup(groups, () => forceCollide<SimNode>((n) => n.radius).strength(0.9).iterations(2)))
    .force('featureX', forceX<SimNode>((n) => n.anchor?.x ?? 0).strength(gravity))
    .force('featureY', forceY<SimNode>((n) => n.anchor?.y ?? 0).strength(gravity))
    .force('stayX', forceX<SimNode>((n) => n.previous?.x ?? 0).strength((n) => (n.previous ? 0.3 : 0)))
    .force('stayY', forceY<SimNode>((n) => n.previous?.y ?? 0).strength((n) => (n.previous ? 0.3 : 0)))
    .stop()

  const iterations = options.iterations ?? (warm ? 120 : 320)
  simulation.alpha(warm ? 0.25 : 1)
  for (let i = 0; i < iterations; i++) simulation.tick()

  const result = new Map<string, Vec3>()
  for (const node of sorted) {
    const sim = byId.get(node.id)!
    const height = (heights.get(node.layer) ?? fallbackHeight) - roleOffset(node.role, options, node.layer)
    result.set(node.id, [round(sim.x ?? 0), round(height), round(sim.y ?? 0)])
  }
  return result
}

function featureOf(node: LayoutNode): string | undefined {
  const tag = node.tags?.find((t) => t.startsWith('feature:'))
  return tag ? tag.slice('feature:'.length).toLowerCase() : undefined
}

/** Applies a force separately inside each group (plane), so planes don't push each other around. */
function perGroup(groups: Map<string, SimNode[]>, make: () => Force<SimNode, undefined>): Force<SimNode, undefined> {
  let forces: Force<SimNode, undefined>[] = []
  const force = ((alpha: number) => {
    for (const f of forces) f(alpha)
  }) as Force<SimNode, undefined>
  force.initialize = (_nodes: SimNode[], random: () => number) => {
    forces = [...groups.keys()].sort().map((key) => {
      const f = make()
      f.initialize?.(groups.get(key)!, random)
      return f
    })
  }
  return force
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
