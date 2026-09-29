/**
 * Trace mode: from a selected node, follow "flow" edges downstream (what it depends on) and upstream
 * (what depends on it). The two directions are separate slices, so a trace never wanders into
 * sibling branches (up to a shared dependency and back down). "Context" edges (tests, migrations,
 * config…) are added one hop around the selection. Containers trace through their children, and
 * traced children light up their parents.
 */
import type { GraphIndex } from './graph.ts'

export type TraceRole = 'root' | 'down' | 'up' | 'context' | 'ancestor'

export interface TraceNode {
  role: TraceRole
  depth: number
}

export interface TraceResult {
  root: number
  nodes: Map<number, TraceNode>
  edges: Set<number>
  down: number
  up: number
}

export interface TraceOptions {
  includeTests: boolean
  maxDepth?: number
}

const TEST_EDGES = new Set(['tests', 'mocks'])

export function computeTrace(index: GraphIndex, root: number, options: TraceOptions): TraceResult {
  const flow = new Set([...index.edgeTypes.values()].filter((t) => t.flow).map((t) => t.id))
  const context = new Set([...index.edgeTypes.values()].filter((t) => t.context).map((t) => t.id))
  if (!options.includeTests) for (const t of TEST_EDGES) context.delete(t)
  const maxDepth = options.maxDepth ?? 64

  const nodes = new Map<number, TraceNode>()
  const edges = new Set<number>()
  const seeds = [root, ...descendants(index, root)]
  for (const seed of seeds) nodes.set(seed, { role: 'root', depth: 0 })

  const isTest = (i: number) => (index.roleChain.get(index.nodes[i].role) ?? []).includes('test')
  const walk = (direction: 'down' | 'up') => {
    let frontier = [...seeds]
    const seen = new Set(seeds)
    for (let depth = 1; frontier.length > 0 && depth <= maxDepth; depth++) {
      const next: number[] = []
      for (const i of frontier) {
        for (const e of direction === 'down' ? index.outEdges[i] : index.inEdges[i]) {
          if (!flow.has(index.edges[e].type)) continue
          const j = direction === 'down' ? index.edgeTo[e] : index.edgeFrom[e]
          if (!options.includeTests && isTest(j) && !seeds.includes(j)) continue
          edges.add(e)
          if (seen.has(j)) continue
          seen.add(j)
          if (!nodes.has(j)) nodes.set(j, { role: direction, depth })
          next.push(j)
        }
      }
      frontier = next
    }
    return seen.size - seeds.length
  }
  const down = walk('down')
  const up = walk('up')

  // One hop of context around the selection (tests, migrations, config, mirrors…).
  for (const seed of seeds) {
    for (const e of [...index.outEdges[seed], ...index.inEdges[seed]]) {
      const type = index.edges[e].type
      if (!context.has(type) && !(options.includeTests && TEST_EDGES.has(type))) continue
      edges.add(e)
      const other = index.edgeFrom[e] === seed ? index.edgeTo[e] : index.edgeFrom[e]
      if (!nodes.has(other)) nodes.set(other, { role: 'context', depth: 1 })
    }
  }
  // Parents of traced nodes give context (a traced column lights up its table).
  for (const i of [...nodes.keys()]) {
    let p = index.parent[i]
    let guard = 0
    while (p >= 0 && guard++ < 16) {
      if (!nodes.has(p)) nodes.set(p, { role: 'ancestor', depth: nodes.get(i)!.depth })
      p = index.parent[p]
    }
  }
  return { root, nodes, edges, down, up }
}

function descendants(index: GraphIndex, i: number): number[] {
  const result: number[] = []
  const stack = [...index.children[i]]
  while (stack.length > 0 && result.length < 5000) {
    const j = stack.pop()!
    result.push(j)
    stack.push(...index.children[j])
  }
  return result
}

/** Trace nodes grouped by layer (in layer order), each group sorted by direction then depth. */
export function traceByLayer(index: GraphIndex, trace: TraceResult): { layer: string; items: { i: number; node: TraceNode }[] }[] {
  const order: Record<string, number> = { up: 0, root: 1, down: 2, context: 3, ancestor: 4 }
  const groups = new Map<string, { i: number; node: TraceNode }[]>()
  for (const [i, node] of trace.nodes) {
    const layer = index.nodes[i].layer
    if (!groups.has(layer)) groups.set(layer, [])
    groups.get(layer)!.push({ i, node })
  }
  return index.layers
    .filter((l) => groups.has(l.id))
    .map((l) => ({
      layer: l.id,
      items: groups.get(l.id)!.sort((a, b) => order[a.node.role] - order[b.node.role] || a.node.depth - b.node.depth || index.nodes[a.i].label.localeCompare(index.nodes[b.i].label)),
    }))
}
