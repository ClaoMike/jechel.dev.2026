import { edgeKey } from '../shared/types.ts'
import type { GraphNode, RepoGraph } from '../shared/types.ts'

export interface GraphDiff {
  addedNodes: GraphNode[]
  removedNodes: GraphNode[]
  changedNodes: { id: string; fields: string[] }[]
  addedEdges: string[]
  removedEdges: string[]
}

const COMPARED_FIELDS = ['label', 'kind', 'layer', 'role', 'parent', 'file'] as const

/** Structural diff (layout positions are ignored). */
export function diffGraphs(before: RepoGraph, after: RepoGraph): GraphDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]))
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]))
  const beforeEdges = new Set(before.edges.map(edgeKey))
  const afterEdges = new Set(after.edges.map(edgeKey))
  const changedNodes: GraphDiff['changedNodes'] = []
  for (const [id, node] of afterNodes) {
    const old = beforeNodes.get(id)
    if (!old) continue
    const fields = COMPARED_FIELDS.filter((field) => old[field] !== node[field])
    if (fields.length > 0) changedNodes.push({ id, fields: [...fields] })
  }
  return {
    addedNodes: after.nodes.filter((n) => !beforeNodes.has(n.id)),
    removedNodes: before.nodes.filter((n) => !afterNodes.has(n.id)),
    changedNodes,
    addedEdges: [...afterEdges].filter((k) => !beforeEdges.has(k)),
    removedEdges: [...beforeEdges].filter((k) => !afterEdges.has(k)),
  }
}

export function formatDiff(diff: GraphDiff): string {
  const lines: string[] = []
  const section = (title: string, items: string[]) => {
    if (items.length === 0) return
    lines.push(`${title} (${items.length})`)
    for (const item of items.slice(0, 200)) lines.push(`  ${item}`)
    if (items.length > 200) lines.push(`  … ${items.length - 200} more`)
  }
  section('+ nodes', diff.addedNodes.map((n) => `${n.id}  [${n.kind}]`))
  section('- nodes', diff.removedNodes.map((n) => `${n.id}  [${n.kind}]`))
  section('~ nodes', diff.changedNodes.map((c) => `${c.id}  (${c.fields.join(', ')})`))
  section('+ edges', diff.addedEdges)
  section('- edges', diff.removedEdges)
  return lines.length > 0 ? lines.join('\n') : 'No structural differences.'
}
