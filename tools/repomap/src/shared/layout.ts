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
 * - Tree layers (`treeLayers`) are laid out together as one radial tree instead: the entry point in the
 *   centre, each ring one step further along the dependencies (renders, uses, calls…), whichever of
 *   those layers a node is on. Their nodes stay fixed while the other layers' simulation runs, so an
 *   endpoint still settles under the API call that reaches it.
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
import type { LayerDef, RoleDef } from './types.ts'

export type Vec3 = [number, number, number]

export interface LayoutNode {
  id: string
  layer: string
  role: string
  parent?: string
  tags?: string[]
  /** Relative size (1 = default); bigger nodes get more room. */
  size?: number
  /** Node kind: tree layers grow from their `entrypoint` nodes. */
  kind?: string
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
  /** Layers laid out together as one radial tree (from the entry point), not by the force simulation. */
  treeLayers?: string[]
  layerGap?: number
  /** Layer id → distance to the layer above it, when it isn't `layerGap`. */
  layerGaps?: Record<string, number>
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
  fx?: number | null
  fy?: number | null
}

type SimLink = SimulationLinkDatum<SimNode> & { distance: number; strength: number }

const DEFAULT_GAP = 90

/** The y of each layer plane, top to bottom, centred on 0. `gaps` overrides the distance to the layer above. */
export function layerHeights(layers: string[], layerGap = DEFAULT_GAP, gaps: Record<string, number> = {}): Map<string, number> {
  const depths: number[] = []
  layers.forEach((layer, index) => depths.push(index === 0 ? 0 : depths[index - 1] + (gaps[layer] ?? layerGap)))
  const top = (depths.at(-1) ?? 0) / 2
  const heights = new Map<string, number>()
  layers.forEach((layer, index) => heights.set(layer, round(top - depths[index])))
  return heights
}

/** The layout options that come from the vocabulary (layers and roles), as the builder and the viewer read them. */
export function vocabularyOptions(
  layers: readonly LayerDef[],
  roles: readonly RoleDef[],
): Pick<LayoutOptions, 'layers' | 'flatLayers' | 'treeLayers' | 'layerGaps' | 'roleOffsets' | 'roleParents'> {
  return {
    layers: layers.map((l) => l.id),
    flatLayers: layers.filter((l) => l.flat).map((l) => l.id),
    treeLayers: layers.filter((l) => l.arrange === 'tree').map((l) => l.id),
    layerGaps: Object.fromEntries(layers.filter((l) => l.gap !== undefined).map((l) => [l.id, l.gap!])),
    roleOffsets: Object.fromEntries(roles.filter((r) => r.planeOffset !== undefined).map((r) => [r.id, r.planeOffset!])),
    roleParents: Object.fromEntries(roles.filter((r) => r.parent).map((r) => [r.id, r.parent!])),
  }
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
  const heights = layerHeights(options.layers, gap, options.layerGaps)
  const fallbackHeight = Math.min(0, ...heights.values()) - gap
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

  // ---- Tree layers: fixed positions, computed up front.
  const treeLayers = new Set(options.treeLayers ?? [])
  const tree = treeLayers.size > 0 ? radialTree(sorted.filter((n) => treeLayers.has(n.layer)), edges, options.layers) : new Map<string, [number, number]>()

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
      previous: prev && !tree.has(node.id) ? { x: prev[0], y: prev[2] } : undefined,
    }
  })
  for (const node of simNodes) {
    const fixed = tree.get(node.id)
    if (!fixed) continue
    node.x = node.fx = fixed[0]
    node.y = node.fy = fixed[1]
  }
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
  const free = simNodes.filter((n) => n.fx == null)
  const warm = free.filter((n) => n.previous).length >= free.length * 0.5 && free.length > 0
  const unplaced: SimNode[] = []
  simNodes.forEach((node) => {
    if (node.fx != null) return
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

/** Edge types a tree grows along first; any other edge only attaches what these don't reach. */
const TREE_EDGES = new Set(['renders', 'uses', 'calls', 'provides'])
const RING_GAP = 24
/** Room a node needs along its ring. */
const TREE_SPACING = 6
/** Leaves under one node are staggered over up to this many rows, so each needs a fraction of the arc. */
const MAX_LEAF_ROWS = 4
const LEAF_ROW_GAP = 6

/** The tree's parent of each node of the tree layers (child id → parent id), as the layout draws it. */
export function treeParents(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], layers: string[]): Map<string, string> {
  const parents = new Map<string, string>()
  for (const [parent, kids] of spanningTree(nodes, edges, layers).children) {
    if (parent !== CENTRE) for (const kid of kids) parents.set(kid, parent)
  }
  return parents
}

/** The invisible centre several roots hang from. */
const CENTRE = '\u0000centre'

/**
 * The spanning tree: entry points first, then breadth first along renders/uses/calls/provides, any edge,
 * any edge backwards; a contained node always hangs under its container.
 */
function spanningTree(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  layers: string[],
): { children: Map<string, string[]>; depth: Map<string, number>; centre: string | undefined } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const layerIndex = new Map(layers.map((l, i) => [l, i]))
  const order = (a: string, b: string) => {
    const la = layerIndex.get(byId.get(a)!.layer) ?? 0
    const lb = layerIndex.get(byId.get(b)!.layer) ?? 0
    return la !== lb ? la - lb : a < b ? -1 : a > b ? 1 : 0
  }
  const container = (id: string) => {
    const parent = byId.get(id)!.parent
    return parent && byId.has(parent) ? parent : undefined
  }
  /** The outermost container: what the tree reaches instead of a contained node. */
  const top = (id: string) => {
    const seen = new Set([id])
    for (let up = container(id); up && !seen.has(up); up = container(up)) {
      seen.add(up)
      id = up
    }
    return id
  }
  const contained = new Map<string, string[]>()
  for (const node of nodes) {
    const parent = container(node.id)
    if (parent) (contained.get(parent) ?? contained.set(parent, []).get(parent)!).push(node.id)
  }
  const out = new Map<string, LayoutEdge[]>()
  const into = new Map<string, LayoutEdge[]>()
  for (const edge of edges) {
    if (edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to) || edge.type === 'contains') continue
    ;(out.get(edge.from) ?? out.set(edge.from, []).get(edge.from)!).push(edge)
    ;(into.get(edge.to) ?? into.set(edge.to, []).get(edge.to)!).push(edge)
  }

  const children = new Map<string, string[]>()
  const depth = new Map<string, number>()
  const attach = (child: string, parent: string | undefined) => {
    depth.set(child, parent === undefined ? 0 : depth.get(parent)! + 1)
    if (parent !== undefined) (children.get(parent) ?? children.set(parent, []).get(parent)!).push(child)
  }
  const grow = (queue: string[], next: (id: string) => string[]) => {
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]
      const found = [...(contained.get(id) ?? []), ...next(id).map(top)].filter((c, k, all) => !depth.has(c) && all.indexOf(c) === k)
      for (const child of found.sort(order)) {
        attach(child, id)
        queue.push(child)
      }
    }
  }

  const entries = nodes.filter((n) => n.kind === 'entrypoint' && !container(n.id)).map((n) => n.id)
  const pointedAt = new Set(edges.filter((e) => TREE_EDGES.has(e.type) && e.from !== e.to).map((e) => e.to))
  const roots = (entries.length > 0 ? entries : nodes.filter((n) => !container(n.id) && !pointedAt.has(n.id)).map((n) => n.id)).sort(order)
  // Several roots share an invisible centre, one ring in.
  const multi = roots.length > 1
  if (multi) depth.set(CENTRE, 0)
  for (const root of roots) attach(root, multi ? CENTRE : undefined)
  const all = () => [...depth.keys()]
  grow(all(), (id) => (out.get(id) ?? []).filter((e) => TREE_EDGES.has(e.type)).map((e) => e.to))
  grow(all(), (id) => (out.get(id) ?? []).map((e) => e.to))
  grow(all(), (id) => (into.get(id) ?? []).map((e) => e.from))
  return { children, depth, centre: multi ? CENTRE : roots[0] }
}

/**
 * One radial tree over the given nodes: entry points (kind `entrypoint`, else the nodes nothing points at)
 * in the centre, each node on the ring of its distance from them. A node's tree parent is the first node
 * that reaches it (breadth first, along renders/uses/calls/provides, then any edge, then any edge
 * backwards); a contained node (API call, route, hook of a query API…) hangs under its container.
 * Each subtree gets a wedge as wide as its leaves need (sibling leaves are staggered over a few rows to
 * save room). Nodes the tree can't reach go on an outer ring.
 */
function radialTree(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], layers: string[]): Map<string, [number, number]> {
  const { children, depth, centre } = spanningTree(nodes, edges, layers)

  // Sibling leaves staggered over rows (two leaves: two rows, four or more: four).
  const row = new Map<string, number>()
  const rows = new Map<string, number>()
  for (const kids of children.values()) {
    const leaves = kids.filter((kid) => !children.has(kid))
    const count = Math.min(MAX_LEAF_ROWS, leaves.length)
    leaves.forEach((leaf, i) => {
      row.set(leaf, i % count)
      rows.set(leaf, count)
    })
  }
  const width = (id: string) => 1 / (rows.get(id) ?? 1)

  // Ring radii: one step apart, and wide enough for every node on the ring.
  const maxDepth = Math.max(0, ...depth.values())
  const perRing = new Array<number>(maxDepth + 1).fill(0)
  for (const [id, d] of depth) perRing[d] += width(id)
  const radius = [0]
  for (let d = 1; d <= maxDepth; d++) radius.push(Math.max(radius[d - 1] + RING_GAP, (perRing[d] * TREE_SPACING) / (2 * Math.PI)))

  // Wedges: each node needs its own arc, or its children's, whichever is wider.
  const result = new Map<string, [number, number]>()
  if (centre === undefined) return result
  const need = new Map<string, number>()
  const measure = (id: string): number => {
    const d = depth.get(id)!
    const own = d === 0 ? 0 : (TREE_SPACING * width(id)) / radius[d]
    const sum = (children.get(id) ?? []).reduce((total, child) => total + measure(child), 0)
    const value = Math.max(own, sum)
    need.set(id, value)
    return value
  }
  /** Splits each node's wedge between its children by what they need. */
  const span = new Map<string, [number, number]>()
  const allocate = (id: string, from: number, size: number) => {
    span.set(id, [from, size])
    const kids = children.get(id) ?? []
    const needed = kids.reduce((sum, child) => sum + need.get(child)!, 0)
    let start = from
    for (const child of kids) {
      const share = needed > 0 ? (need.get(child)! / needed) * size : size / kids.length
      allocate(child, start, share)
      start += share
    }
  }
  // Too crowded for a full turn: push out the rings whose nodes got less arc than they need, and again.
  for (let round = 0; round < 12; round++) {
    if (measure(centre) <= 2 * Math.PI * 1.001) break
    allocate(centre, -Math.PI / 2, 2 * Math.PI)
    const wanted = [...radius]
    for (const [id, [, size]] of span) {
      const d = depth.get(id)!
      if (d > 0) wanted[d] = Math.max(wanted[d], (TREE_SPACING * width(id)) / size)
    }
    for (let d = 1; d <= maxDepth; d++) radius[d] = Math.max(wanted[d], radius[d - 1] + RING_GAP)
  }
  // Whatever is still too crowded: every ring out together.
  const scale = Math.max(1, measure(centre) / (2 * Math.PI))
  allocate(centre, -Math.PI / 2, 2 * Math.PI)
  for (const [id, [from, size]] of span) {
    if (id === CENTRE) continue
    const angle = from + size / 2
    const r = radius[depth.get(id)!] * scale + (row.get(id) ?? 0) * LEAF_ROW_GAP
    result.set(id, [round(Math.cos(angle) * r), round(Math.sin(angle) * r)])
  }

  // What nothing reaches: an outer ring (or more), in file order.
  const left = nodes.filter((n) => !depth.has(n.id)).map((n) => n.id).sort()
  let ring = (radius[maxDepth] ?? 0) * scale + (MAX_LEAF_ROWS - 1) * LEAF_ROW_GAP
  for (let i = 0; i < left.length; ) {
    ring += RING_GAP
    const fits = Math.max(1, Math.floor((2 * Math.PI * ring) / TREE_SPACING))
    const batch = left.slice(i, i + fits)
    batch.forEach((id, k) => {
      const angle = -Math.PI / 2 + ((k + 0.5) / batch.length) * 2 * Math.PI
      result.set(id, [round(Math.cos(angle) * ring), round(Math.sin(angle) * ring)])
    })
    i += batch.length
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
