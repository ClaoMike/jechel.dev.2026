/**
 * Indexes a graph.json for fast lookups: adjacency, hierarchy and the vocabulary (layers, kinds, roles).
 */
import type { GraphEdge, GraphNode, KindDef, LayerDef, RepoGraph, RoleDef } from '../../../src/shared/types.ts'

export interface GraphIndex {
  graph: RepoGraph
  nodes: GraphNode[]
  edges: GraphEdge[]
  byId: Map<string, number>
  edgeFrom: Int32Array
  edgeTo: Int32Array
  outEdges: number[][]
  parent: Int32Array
  children: number[][]
  /** Connections per node (containment left out): search ranks well-connected nodes first. */
  degree: Uint32Array
  layers: LayerDef[]
  layerById: Map<string, LayerDef>
  kinds: Map<string, KindDef>
  roles: Map<string, RoleDef>
}

const FALLBACK_KIND: KindDef = { id: 'unknown', label: 'Unknown', color: '#9ca3af' }

export function indexGraph(graph: RepoGraph): GraphIndex {
  const nodes = graph.nodes
  const byId = new Map<string, number>()
  nodes.forEach((n, i) => byId.set(n.id, i))
  const edges = graph.edges.filter((e) => byId.has(e.from) && byId.has(e.to))
  const n = nodes.length
  const edgeFrom = new Int32Array(edges.length)
  const edgeTo = new Int32Array(edges.length)
  const outEdges: number[][] = Array.from({ length: n }, () => [])
  const degree = new Uint32Array(n)
  edges.forEach((edge, e) => {
    const from = byId.get(edge.from)!
    const to = byId.get(edge.to)!
    edgeFrom[e] = from
    edgeTo[e] = to
    outEdges[from].push(e)
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
  return { graph, nodes, edges, byId, edgeFrom, edgeTo, outEdges, parent, children, degree, layers, layerById, kinds, roles }
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
