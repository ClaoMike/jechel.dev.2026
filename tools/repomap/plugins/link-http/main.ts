/**
 * Stack-agnostic linker: resolves `http` and `navigate` facts against the route tables in the graph.
 *
 * - http facts (API calls, integration-test requests, MSW/Playwright mocks, .http files, scripts)
 *   → nodes with attrs.method + attrs.route (backend endpoints)
 * - navigate facts (links, redirects, page.goto) → nodes with attrs.path (frontend routes), falling
 *   back to endpoints (e.g. a link to /api/auth/login)
 *
 * Anything that doesn't match is reported as unresolved, so the viewer can show it in red.
 */
import { log, runPlugin } from '../../src/plugin-kit.ts'
import { findBestRoute, normalizeUrl, type RouteCandidate } from '../../src/shared/routes.ts'
import type { GraphNode, PluginEdge, PluginOutput, UnresolvedLink } from '../../src/shared/types.ts'

await runPlugin((request): PluginOutput => {
  const graph = request.graph
  if (!graph) throw new Error('link-http needs the graph (linker request)')

  const endpoints: RouteCandidate<GraphNode>[] = graph.nodes
    .filter((n) => typeof n.attrs?.route === 'string')
    .map((n) => ({ method: (n.attrs!.method as string | undefined) ?? 'ANY', path: n.attrs!.route as string, value: n }))
  const routes: RouteCandidate<GraphNode>[] = graph.nodes
    .filter((n) => n.kind === 'route' && typeof n.attrs?.path === 'string')
    .map((n) => ({ path: n.attrs!.path as string, value: n }))

  const edges: PluginEdge[] = []
  const unresolved: UnresolvedLink[] = []
  let resolved = 0

  for (const fact of graph.facts) {
    if (fact.type !== 'http' && fact.type !== 'navigate') continue
    if (!fact.url) continue
    const path = normalizeUrl(fact.url)
    if (path === null) continue
    const match =
      fact.type === 'http'
        ? findBestRoute(fact.method, fact.url, endpoints)
        : (findBestRoute(undefined, fact.url, routes) ?? findBestRoute('GET', fact.url, endpoints))
    const method = fact.type === 'http' ? (fact.method ?? 'GET').toUpperCase() : undefined
    if (match) {
      resolved++
      edges.push({
        from: fact.from,
        to: match.value.id,
        type: fact.edgeType,
        confidence: round(Math.min(fact.confidence ?? 1, match.score)),
        evidence: fact.evidence,
        attrs: { ...(fact.attrs ?? {}), ...(method ? { method } : {}), url: fact.url },
      })
    } else {
      unresolved.push({
        from: fact.from,
        type: fact.edgeType,
        target: method ? `${method} ${path}` : path,
        reason: fact.type === 'http' ? 'no endpoint matches this request' : 'no route matches this link',
        evidence: fact.evidence,
      })
    }
  }
  log(`http: ${resolved} links resolved, ${unresolved.length} unresolved (${endpoints.length} endpoints, ${routes.length} routes)`)
  return { protocol: 1, edges, unresolved }
})

function round(value: number): number {
  return Math.round(value * 100) / 100
}
