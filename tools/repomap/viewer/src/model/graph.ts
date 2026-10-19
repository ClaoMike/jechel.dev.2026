/**
 * Indexes a graph.json for fast lookups: adjacency, hierarchy, positions, planes, vocabulary.
 * Graphs without baked positions (e.g. produced by another tool) are laid out here.
 */
import { computeLayout, layerHeights, treeParents, vocabularyOptions, type Vec3 } from '../../../src/shared/layout.ts'
import type {
  EdgeTypeDef,
  GraphEdge,
  GraphNode,
  KindDef,
  LayerDef,
  RepoGraph,
  RoleDef,
  UnresolvedLink,
} from '../../../src/shared/types.ts'

export interface Plane {
  layer: string
  y: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface GraphIndex {
  graph: RepoGraph
  nodes: GraphNode[]
  edges: GraphEdge[]
  byId: Map<string, number>
  edgeFrom: Int32Array
  edgeTo: Int32Array
  outEdges: number[][]
  inEdges: number[][]
  parent: Int32Array
  children: number[][]
  positions: Float32Array
  radius: Float32Array
  degree: Uint32Array
  layers: LayerDef[]
  layerById: Map<string, LayerDef>
  kinds: Map<string, KindDef>
  roles: Map<string, RoleDef>
  /** role → [role, parent, grandparent…] */
  roleChain: Map<string, string[]>
  edgeTypes: Map<string, EdgeTypeDef>
  /** Kinds present per layer, in vocabulary order. */
  layerKinds: Map<string, string[]>
  /** Roles present in the graph (leaf roles), in vocabulary order. */
  presentRoles: Set<string>
  presentEdgeTypes: string[]
  features: string[]
  featureOf: Int16Array
  planes: Plane[]
  center: Vec3
  extent: number
  unresolvedByNode: Map<number, UnresolvedLink[]>
  added: Set<number>
  /** 1 for an edge between two nodes of tree layers that isn't a link of the tree (hidden in "tree edges only"). */
  offTree: Uint8Array
}

const FALLBACK_KIND: KindDef = { id: 'unknown', label: 'Unknown', color: '#9ca3af', shape: 'sphere', size: 0.8 }

export function indexGraph(graph: RepoGraph): GraphIndex {
  const nodes = graph.nodes
  const byId = new Map<string, number>()
  nodes.forEach((n, i) => byId.set(n.id, i))
  const edges = graph.edges.filter((e) => byId.has(e.from) && byId.has(e.to))

  const n = nodes.length
  const edgeFrom = new Int32Array(edges.length)
  const edgeTo = new Int32Array(edges.length)
  const outEdges: number[][] = Array.from({ length: n }, () => [])
  const inEdges: number[][] = Array.from({ length: n }, () => [])
  const degree = new Uint32Array(n)
  edges.forEach((edge, e) => {
    const from = byId.get(edge.from)!
    const to = byId.get(edge.to)!
    edgeFrom[e] = from
    edgeTo[e] = to
    outEdges[from].push(e)
    inEdges[to].push(e)
    if (edge.type !== 'contains') {
      degree[from]++
      degree[to]++
    }
  })

  const parent = new Int32Array(n).fill(-1)
  const children: number[][] = Array.from({ length: n }, () => [])
  nodes.forEach((node, i) => {
    const p = node.parent ? byId.get(node.parent) : undefined
    if (p !== undefined && p !== i) {
      parent[i] = p
      children[p].push(i)
    }
  })

  const meta = graph.meta
  const layers = [...meta.layers]
  for (const node of nodes) {
    if (!layers.some((l) => l.id === node.layer)) layers.push({ id: node.layer, label: node.layer, color: '#9ca3af' })
  }
  const layerById = new Map(layers.map((l) => [l.id, l]))
  const kinds = new Map(meta.kinds.map((k) => [k.id, k]))
  for (const node of nodes) if (!kinds.has(node.kind)) kinds.set(node.kind, { ...FALLBACK_KIND, id: node.kind, label: node.kind })
  const roles = new Map(meta.roles.map((r) => [r.id, r]))
  for (const node of nodes) if (!roles.has(node.role)) roles.set(node.role, { id: node.role, label: node.role, color: '#9ca3af' })
  const roleChain = new Map<string, string[]>()
  for (const role of roles.keys()) {
    const chain: string[] = []
    let current: string | undefined = role
    while (current && !chain.includes(current)) {
      chain.push(current)
      current = roles.get(current)?.parent
    }
    roleChain.set(role, chain)
  }
  const edgeTypes = new Map(meta.edgeTypes.map((t) => [t.id, t]))
  for (const edge of edges) if (!edgeTypes.has(edge.type)) edgeTypes.set(edge.type, { id: edge.type, label: edge.type, color: '#94a3b8' })

  // Kinds per layer, ordered like the vocabulary.
  const kindOrder = new Map([...kinds.keys()].map((k, i) => [k, i]))
  const layerKinds = new Map<string, string[]>()
  for (const node of nodes) {
    const list = layerKinds.get(node.layer) ?? []
    if (!list.includes(node.kind)) list.push(node.kind)
    layerKinds.set(node.layer, list)
  }
  for (const list of layerKinds.values()) list.sort((a, b) => kindOrder.get(a)! - kindOrder.get(b)!)

  const presentRoles = new Set(nodes.map((n) => n.role))
  const typeOrder = new Map([...edgeTypes.keys()].map((t, i) => [t, i]))
  const presentEdgeTypes = [...new Set(edges.map((e) => e.type))].sort((a, b) => typeOrder.get(a)! - typeOrder.get(b)!)

  // Features from `feature:x` tags.
  const featureList: string[] = []
  const featureOf = new Int16Array(n).fill(-1)
  nodes.forEach((node, i) => {
    const tag = node.tags?.find((t) => t.startsWith('feature:'))
    if (!tag) return
    const feature = tag.slice(8)
    let index = featureList.indexOf(feature)
    if (index < 0) {
      featureList.push(feature)
      index = featureList.length - 1
    }
    featureOf[i] = index
  })

  // Positions: baked by the builder, or computed here.
  const layerIds = layers.map((l) => l.id)
  const gap = meta.layout?.layerGap ?? 90
  let missing = nodes.some((node) => !node.pos)
  const positions = new Float32Array(n * 3)
  if (missing) {
    const computed = computeLayout(
      nodes.map((node) => ({ id: node.id, layer: node.layer, role: node.role, parent: node.parent, tags: node.tags, size: kinds.get(node.kind)?.size, kind: node.kind })),
      edges,
      {
        ...vocabularyOptions(layers, meta.roles),
        layerGap: gap,
        seed: meta.layout?.seed ?? 7,
      },
    )
    nodes.forEach((node, i) => positions.set(node.pos ?? computed.get(node.id)!, i * 3))
    missing = false
  } else {
    nodes.forEach((node, i) => positions.set(node.pos!, i * 3))
  }

  const radius = new Float32Array(n)
  nodes.forEach((node, i) => {
    const size = kinds.get(node.kind)?.size ?? 1
    radius[i] = Math.min(4.2, Math.max(0.45, 1.45 * size * (0.85 + 0.2 * Math.log2(1 + degree[i]))))
  })

  // Layer planes share one footprint (the bounds of every node), so the stack reads like floors of a
  // building and filtering never resizes anything.
  const heights = layerHeights(layerIds, gap, vocabularyOptions(layers, []).layerGaps)
  const planes: Plane[] = []
  let fx0 = Infinity
  let fx1 = -Infinity
  let fz0 = Infinity
  let fz1 = -Infinity
  nodes.forEach((_, i) => {
    fx0 = Math.min(fx0, positions[i * 3] - radius[i])
    fx1 = Math.max(fx1, positions[i * 3] + radius[i])
    fz0 = Math.min(fz0, positions[i * 3 + 2] - radius[i])
    fz1 = Math.max(fz1, positions[i * 3 + 2] + radius[i])
  })
  if (Number.isFinite(fx0)) {
    const margin = 14
    const cx = (fx0 + fx1) / 2
    const cz = (fz0 + fz1) / 2
    const halfX = Math.max(40, (fx1 - fx0) / 2 + margin)
    const halfZ = Math.max(40, (fz1 - fz0) / 2 + margin)
    for (const layer of layers) {
      if (!nodes.some((node) => node.layer === layer.id)) continue
      planes.push({ layer: layer.id, y: heights.get(layer.id) ?? 0, minX: cx - halfX, maxX: cx + halfX, minZ: cz - halfZ, maxZ: cz + halfZ })
    }
  }

  // Scene extent for the camera.
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, positions[i * 3]); maxX = Math.max(maxX, positions[i * 3])
    minY = Math.min(minY, positions[i * 3 + 1]); maxY = Math.max(maxY, positions[i * 3 + 1])
    minZ = Math.min(minZ, positions[i * 3 + 2]); maxZ = Math.max(maxZ, positions[i * 3 + 2])
  }
  for (const plane of planes) {
    minX = Math.min(minX, plane.minX); maxX = Math.max(maxX, plane.maxX)
    minZ = Math.min(minZ, plane.minZ); maxZ = Math.max(maxZ, plane.maxZ)
  }
  if (n === 0) [minX, minY, minZ, maxX, maxY, maxZ] = [-50, -50, -50, 50, 50, 50]
  const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  const extent = Math.max(60, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2)

  const unresolvedByNode = new Map<number, UnresolvedLink[]>()
  for (const link of graph.unresolved ?? []) {
    const i = byId.get(link.from)
    if (i === undefined) continue
    const list = unresolvedByNode.get(i) ?? []
    list.push(link)
    unresolvedByNode.set(i, list)
  }
  const added = new Set<number>()
  for (const id of meta.changes?.addedNodes ?? []) {
    const i = byId.get(id)
    if (i !== undefined) added.add(i)
  }

  // Tree layers: the same spanning tree the layout drew, so the other edges between them can be left out.
  const treeLayers = new Set(layers.filter((l) => l.arrange === 'tree').map((l) => l.id))
  const offTree = new Uint8Array(edges.length)
  if (treeLayers.size > 0) {
    const inTree = nodes.filter((node) => treeLayers.has(node.layer))
    const tree = treeParents(
      inTree.map((node) => ({ id: node.id, layer: node.layer, role: node.role, parent: node.parent, kind: node.kind })),
      edges,
      layerIds,
    )
    // The tree reaches a contained node's outermost container instead (hook → api.about.get hangs `api` under the hook).
    const top = (id: string) => {
      for (let i = byId.get(id)!, up = parent[i]; up >= 0 && treeLayers.has(nodes[up].layer); i = up, up = parent[up]) id = nodes[up].id
      return id
    }
    edges.forEach((edge, e) => {
      if (!treeLayers.has(nodes[edgeFrom[e]].layer) || !treeLayers.has(nodes[edgeTo[e]].layer)) return
      const link = tree.get(edge.to) === edge.from || tree.get(edge.from) === edge.to || tree.get(top(edge.to)) === edge.from || tree.get(top(edge.from)) === edge.to
      if (!link) offTree[e] = 1
    })
  }

  return {
    graph, nodes, edges, byId, edgeFrom, edgeTo, outEdges, inEdges, parent, children, positions, radius, degree,
    layers, layerById, kinds, roles, roleChain, edgeTypes, layerKinds, presentRoles, presentEdgeTypes,
    features: featureList, featureOf, planes, center, extent, unresolvedByNode, added, offTree,
  }
}

/** Light structural check for graphs loaded from files/URLs. Returns an error message or null. */
export function checkGraph(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Not a JSON object.'
  const graph = value as Partial<RepoGraph>
  if (typeof graph.version !== 'number') return 'Missing "version" — is this a repomap graph.json?'
  if (graph.version > 1) return `graph.json version ${graph.version} is newer than this viewer supports (1).`
  if (!graph.meta || !Array.isArray(graph.meta.layers) || !Array.isArray(graph.meta.kinds)) return 'Missing "meta" vocabulary (layers/kinds).'
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return 'Missing "nodes" or "edges".'
  for (const node of graph.nodes.slice(0, 50)) {
    if (!node || typeof node.id !== 'string' || typeof node.layer !== 'string' || typeof node.kind !== 'string') return 'Nodes need id, layer and kind.'
  }
  return null
}

export function nodeFeature(index: GraphIndex, i: number): string | undefined {
  const f = index.featureOf[i]
  return f >= 0 ? index.features[f] : undefined
}
