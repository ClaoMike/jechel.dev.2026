/**
 * Merges plugin outputs into one graph: fills in layer/role from file rules, de-duplicates nodes and
 * edges, resolves file references, derives `contains` edges from parents, and moves edges that point
 * at unknown nodes to `unresolved` instead of silently dropping them.
 */
import { edgeKey } from '../shared/types.ts'
import type {
  Diagnostic,
  Evidence,
  Fact,
  FileEntry,
  GraphEdge,
  GraphNode,
  PluginEdge,
  PluginNode,
  PluginOutput,
  UnresolvedLink,
} from '../shared/types.ts'

const MAX_EVIDENCE = 5

export class GraphAssembler {
  readonly nodes = new Map<string, GraphNode>()
  readonly edges = new Map<string, GraphEdge>()
  readonly facts: Fact[] = []
  readonly claims = new Set<string>()
  readonly unresolved: UnresolvedLink[] = []
  readonly diagnostics: Diagnostic[] = []
  private readonly files: Map<string, FileEntry>
  private readonly defaults: { layer: string; role: string }

  constructor(files: Map<string, FileEntry>, defaults: { layer: string; role: string }) {
    this.files = files
    this.defaults = defaults
  }

  addOutput(pluginId: string, output: PluginOutput): void {
    for (const node of output.nodes ?? []) this.addNode(pluginId, node)
    for (const edge of output.edges ?? []) this.addEdge(edge)
    for (const fact of output.facts ?? []) this.facts.push(fact)
    for (const claim of output.claims ?? []) this.claims.add(claim)
    for (const link of output.unresolved ?? []) this.unresolved.push(link)
    for (const diagnostic of output.diagnostics ?? []) this.diagnostics.push({ ...diagnostic, plugin: pluginId })
  }

  addNode(pluginId: string, input: PluginNode): void {
    const file = input.file ? this.files.get(input.file) : undefined
    const node: GraphNode = compact({
      ...input,
      layer: input.layer ?? file?.layer ?? this.defaults.layer,
      role: input.role ?? file?.role ?? this.defaults.role,
      roleReason: input.roleReason ?? (input.role ? `set by the ${pluginId} plugin` : (file?.roleReason ?? 'no role rule matched')),
    })
    const existing = this.nodes.get(node.id)
    if (!existing) {
      this.nodes.set(node.id, node)
      return
    }
    // Same id from two plugins: keep the first plugin's values, fill the gaps from the second.
    for (const [key, value] of Object.entries(node) as [keyof GraphNode, unknown][]) {
      if (value === undefined) continue
      if (key === 'tags') existing.tags = [...new Set([...(existing.tags ?? []), ...(value as string[])])]
      else if (key === 'attrs') existing.attrs = { ...(value as Record<string, unknown>), ...(existing.attrs ?? {}) }
      else if (existing[key] === undefined) (existing as unknown as Record<string, unknown>)[key] = value
    }
  }

  addEdge(input: PluginEdge): void {
    if (input.from === input.to) return
    const edge: GraphEdge = compact({
      ...input,
      source: input.source ?? 'static',
      confidence: clamp01(input.confidence ?? 1),
    })
    const key = edgeKey(edge)
    const existing = this.edges.get(key)
    if (!existing) {
      if (edge.evidence) edge.evidence = dedupeEvidence(edge.evidence)
      this.edges.set(key, edge)
      return
    }
    existing.confidence = Math.max(existing.confidence, edge.confidence)
    if (edge.source === 'static') existing.source = 'static'
    if (edge.evidence) existing.evidence = dedupeEvidence([...(existing.evidence ?? []), ...edge.evidence])
    if (edge.attrs) existing.attrs = { ...edge.attrs, ...(existing.attrs ?? {}) }
  }

  /** Current state, as handed to linkers. */
  snapshot(): { nodes: GraphNode[]; edges: GraphEdge[]; facts: Fact[] } {
    return { nodes: [...this.nodes.values()], edges: [...this.edges.values()], facts: this.facts }
  }

  /** `file-ref` facts → edges to the node that represents the referenced file. */
  resolveFileRefs(): void {
    const byFile = new Map<string, GraphNode[]>()
    for (const node of this.nodes.values()) {
      if (!node.file) continue
      if (!byFile.has(node.file)) byFile.set(node.file, [])
      byFile.get(node.file)!.push(node)
    }
    for (const fact of this.facts) {
      if (fact.type !== 'file-ref' || !fact.path) continue
      const candidates = byFile.get(fact.path) ?? []
      const target =
        candidates.find((n) => n.id.includes(':file:')) ??
        candidates.find((n) => n.kind === 'entrypoint' || n.id.includes(':module:')) ??
        [...candidates].filter((n) => !n.parent).sort((a, b) => (a.line ?? 0) - (b.line ?? 0))[0]
      if (target && target.id !== fact.from) {
        this.addEdge({ from: fact.from, to: target.id, type: fact.edgeType, confidence: fact.confidence, evidence: fact.evidence })
      } else if (!target) {
        this.unresolved.push({ from: fact.from, type: fact.edgeType, target: fact.path, reason: 'no node represents this file', evidence: fact.evidence })
      }
    }
  }

  finalize(): { nodes: GraphNode[]; edges: GraphEdge[]; unresolved: UnresolvedLink[] } {
    // Parents must exist.
    for (const node of this.nodes.values()) {
      if (node.parent && !this.nodes.has(node.parent)) {
        this.diagnostics.push({ level: 'warn', message: `${node.id}: parent ${node.parent} not found`, file: node.file })
        delete node.parent
      }
    }
    // Explicit contains edges for every parent relation.
    for (const node of this.nodes.values()) {
      if (node.parent) this.addEdge({ from: node.parent, to: node.id, type: 'contains' })
    }
    // Edges must point at nodes.
    for (const [key, edge] of this.edges) {
      const missing = !this.nodes.has(edge.from) ? edge.from : !this.nodes.has(edge.to) ? edge.to : undefined
      if (missing) {
        this.edges.delete(key)
        if (this.nodes.has(edge.from)) {
          this.unresolved.push({ from: edge.from, type: edge.type, target: missing, reason: 'target node not found', evidence: edge.evidence })
        } else {
          this.diagnostics.push({ level: 'warn', message: `dropped ${edge.type} edge from unknown node ${edge.from}` })
        }
      }
    }
    // Descriptions flow along maps-to (property doc comment → column).
    for (const edge of this.edges.values()) {
      if (edge.type !== 'maps-to') continue
      const from = this.nodes.get(edge.from)!
      const to = this.nodes.get(edge.to)!
      if (from.description && !to.description) {
        to.description = from.description
        to.descriptionSource = 'derived'
      }
    }
    const nodes = [...this.nodes.values()].sort((a, b) => compare(a.id, b.id))
    const edges = [...this.edges.values()].sort((a, b) => compare(edgeKey(a), edgeKey(b)))
    const seen = new Set<string>()
    const unresolved = this.unresolved.filter((link) => {
      if (!this.nodes.has(link.from)) return false
      const key = `${link.from}|${link.type}|${link.target}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return { nodes, edges, unresolved }
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1))
}

function dedupeEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>()
  const result: Evidence[] = []
  for (const item of evidence) {
    const key = `${item.file}:${item.line ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
    if (result.length >= MAX_EVIDENCE) break
  }
  return result
}

/** Drops undefined fields so graph.json stays small and stable. */
function compact<T extends object>(value: T): T {
  const result = {} as Record<string, unknown>
  for (const [key, field] of Object.entries(value)) if (field !== undefined) result[key] = field
  return result as T
}
