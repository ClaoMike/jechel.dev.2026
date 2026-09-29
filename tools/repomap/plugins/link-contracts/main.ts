/**
 * Links frontend types to the backend DTOs they mirror.
 *
 * 1. Through the API: a client call typed with `get<CurrentUser>('/api/auth/me')` resolves (via the
 *    http linker) to an endpoint that returns `CurrentUserResponse` → CurrentUser mirrors it.
 * 2. By name: a frontend type and a backend DTO with the same name (e.g. FirstNameResponse).
 */
import { log, runPlugin } from '../../src/plugin-kit.ts'
import type { GraphNode, PluginEdge, PluginOutput } from '../../src/shared/types.ts'

const FRONTEND_TYPE_KINDS = new Set(['type', 'interface'])
const BACKEND_CONTRACT_KINDS = new Set(['dto', 'class'])

await runPlugin((request): PluginOutput => {
  const graph = request.graph
  if (!graph) throw new Error('link-contracts needs the graph (linker request)')
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const edges: PluginEdge[] = []
  const linked = new Set<string>()
  const add = (from: GraphNode, to: GraphNode, confidence: number, reason: string) => {
    const key = `${from.id}|${to.id}`
    if (linked.has(key)) return
    linked.add(key)
    edges.push({ from: from.id, to: to.id, type: 'mirrors', confidence, attrs: { reason } })
  }

  // 1. Response type of a client call ↔ type returned by the endpoint it hits.
  const returnsByEndpoint = new Map<string, GraphNode[]>()
  for (const edge of graph.edges) {
    if (edge.type !== 'returns') continue
    const dto = nodes.get(edge.to)
    if (!dto) continue
    if (!returnsByEndpoint.has(edge.from)) returnsByEndpoint.set(edge.from, [])
    returnsByEndpoint.get(edge.from)!.push(dto)
  }
  for (const edge of graph.edges) {
    if (edge.type !== 'http') continue
    const responseTypeId = edge.attrs?.responseType as string | undefined
    const frontendType = responseTypeId ? nodes.get(responseTypeId) : undefined
    const dtos = returnsByEndpoint.get(edge.to)
    if (!frontendType || !dtos) continue
    for (const dto of dtos) add(frontendType, dto, 0.9, `response of ${nodes.get(edge.to)?.label ?? edge.to}`)
  }

  // 2. Same name on both sides.
  const backendByName = new Map<string, GraphNode[]>()
  for (const node of graph.nodes) {
    if (node.layer === 'frontend' || !BACKEND_CONTRACT_KINDS.has(node.kind)) continue
    const name = simpleName(node.label)
    if (!backendByName.has(name)) backendByName.set(name, [])
    backendByName.get(name)!.push(node)
  }
  for (const node of graph.nodes) {
    if (node.layer !== 'frontend' || !FRONTEND_TYPE_KINDS.has(node.kind)) continue
    for (const match of backendByName.get(simpleName(node.label)) ?? []) {
      if (match.kind === 'dto' || /(Response|Request|Dto)$/.test(match.label)) add(node, match, 0.75, 'same name')
    }
  }
  log(`contracts: ${edges.length} mirrors`)
  return { protocol: 1, edges }
})

function simpleName(label: string): string {
  return label.split('.').pop()!.toLowerCase()
}
