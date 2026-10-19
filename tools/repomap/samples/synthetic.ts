/**
 * Generates a realistic graph.json for a fictional app ("Bookshelf"), using the stack preset's
 * vocabulary. Used as the demo that ships with the static viewer, and (with many features) as a
 * performance test.
 *
 *   node samples/synthetic.ts --features 6  --out viewer/public/samples/demo.graph.json
 *   node samples/synthetic.ts --features 90 --out .out/stress.graph.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { stringifyGraph } from '../src/core/build.ts'
import { loadConfig, TOOL_ROOT } from '../src/core/config.ts'
import { computeLayout, vocabularyOptions } from '../src/shared/layout.ts'
import type { GraphEdge, GraphNode, RepoGraph, UnresolvedLink } from '../src/shared/types.ts'

const { values } = parseArgs({
  options: {
    features: { type: 'string', default: '6' },
    out: { type: 'string', default: 'viewer/public/samples/demo.graph.json' },
  },
})

const FEATURE_NAMES = [
  'book', 'author', 'review', 'order', 'customer', 'shelf', 'payment', 'shipment', 'coupon', 'wishlist', 'publisher', 'genre',
  'event', 'newsletter', 'invoice', 'refund', 'store', 'staff', 'supplier', 'warehouse', 'rating', 'badge', 'quiz', 'podcast',
]

const featureCount = Math.max(1, Number(values.features))
const config = loadConfig(join(TOOL_ROOT, 'repomap.config.json'))

const nodes: GraphNode[] = []
const edges: GraphEdge[] = []
const unresolved: UnresolvedLink[] = []
const ids = new Set<string>()

const pascal = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, __, c: string) => c.toUpperCase())
const plural = (s: string) => (s.endsWith('y') ? `${s.slice(0, -1)}ies` : s.endsWith('s') ? `${s}es` : `${s}s`)

function node(n: Omit<GraphNode, 'role'> & { role?: string }): string {
  if (ids.has(n.id)) return n.id
  ids.add(n.id)
  nodes.push({ role: 'production', ...n } as GraphNode)
  if (n.parent) edge(n.parent, n.id, 'contains')
  return n.id
}

function edge(from: string, to: string, type: string, extra: Partial<GraphEdge> = {}): void {
  edges.push({ from, to, type, source: 'static', confidence: 1, ...extra })
}

// ---------------------------------------------------------------- shared skeleton
const fe = 'frontend'
const be = 'backend'
const db = 'database'
const main = node({ id: 'frontend:module:web/src/main.tsx', label: 'main.tsx', kind: 'entrypoint', layer: fe, file: 'web/src/main.tsx', line: 1, description: 'Mounts the React app' })
const app = node({ id: 'frontend:symbol:web/src/App.tsx#App', label: 'App', kind: 'component', layer: fe, file: 'web/src/App.tsx', line: 8, description: 'Routes of the app' })
const layout = node({ id: 'frontend:symbol:web/src/components/Layout.tsx#Layout', label: 'Layout', kind: 'component', layer: fe, file: 'web/src/components/Layout.tsx', line: 5 })
const authProvider = node({ id: 'frontend:symbol:web/src/auth/AuthProvider.tsx#AuthProvider', label: 'AuthProvider', kind: 'provider', layer: fe, file: 'web/src/auth/AuthProvider.tsx', line: 12, tags: ['feature:auth'] })
const authContext = node({ id: 'frontend:symbol:web/src/auth/authContext.ts#AuthContext', label: 'AuthContext', kind: 'context', layer: fe, file: 'web/src/auth/authContext.ts', line: 3, tags: ['feature:auth'] })
const useAuth = node({ id: 'frontend:symbol:web/src/auth/useAuth.ts#useAuth', label: 'useAuth', kind: 'hook', layer: fe, file: 'web/src/auth/useAuth.ts', line: 4, tags: ['feature:auth'] })
const api = node({ id: 'frontend:symbol:web/src/services/api.ts#api', label: 'api', kind: 'api-client', layer: fe, file: 'web/src/services/api.ts', line: 40, description: 'Every backend call goes through this client' })
const request = node({ id: 'frontend:symbol:web/src/services/api.ts#request', label: 'request', kind: 'function', layer: fe, parent: api, file: 'web/src/services/api.ts', line: 12, tags: ['http'] })
const css = node({ id: 'frontend:file:web/src/index.css', label: 'index.css', kind: 'stylesheet', layer: fe, file: 'web/src/index.css' })
const html = node({ id: 'frontend:file:web/index.html', label: 'index.html', kind: 'html', layer: fe, file: 'web/index.html' })
node({ id: 'frontend:file:web/package.json', label: 'package.json', kind: 'project', layer: fe, role: 'config', file: 'web/package.json' })
node({ id: 'frontend:file:web/vite.config.ts', label: 'vite.config.ts', kind: 'config-file', layer: fe, role: 'config', file: 'web/vite.config.ts' })
const testServer = node({ id: 'frontend:file:web/src/test/server.ts', label: 'server.ts', kind: 'test-helper', layer: fe, role: 'test/support', file: 'web/src/test/server.ts', description: 'MSW mock server' })
edge(html, main, 'uses')
edge(main, app, 'renders')
edge(main, authProvider, 'renders')
edge(main, css, 'uses')
edge(authProvider, authContext, 'provides')
edge(useAuth, authContext, 'uses')
edge(app, layout, 'renders')
edge(layout, useAuth, 'uses')

const program = node({ id: 'backend:class:Bookshelf.Api.Program', label: 'Program', kind: 'entrypoint', layer: be, file: 'api/src/Bookshelf.Api/Program.cs', line: 1, description: 'Composition root: registers services and maps the API' })
const dbContext = node({ id: 'backend:class:Bookshelf.Api.Data.AppDbContext', label: 'AppDbContext', kind: 'dbcontext', layer: be, file: 'api/src/Bookshelf.Api/Data/AppDbContext.cs', line: 6 })
const authSetup = node({ id: 'backend:class:Bookshelf.Api.Features.Auth.AuthSetup', label: 'AuthSetup', kind: 'setup', layer: be, file: 'api/src/Bookshelf.Api/Features/Auth/AuthSetup.cs', line: 9, tags: ['feature:auth'] })
const me = node({ id: 'backend:route:GET /api/auth/me', label: 'GET /api/auth/me', kind: 'endpoint', layer: be, parent: authSetup, file: 'api/src/Bookshelf.Api/Features/Auth/AuthEndpoints.cs', line: 20, tags: ['feature:auth'], attrs: { method: 'GET', route: '/api/auth/me', auth: 'required' } })
const factory = node({ id: 'backend:class:Bookshelf.Api.IntegrationTests.ApiFactory', label: 'ApiFactory', kind: 'test-helper', layer: be, role: 'test/support', file: 'api/tests/Bookshelf.Api.IntegrationTests/ApiFactory.cs', line: 10 })
const appsettings = node({ id: 'backend:file:api/src/Bookshelf.Api/appsettings.json', label: 'appsettings.json', kind: 'config-file', layer: be, role: 'config', file: 'api/src/Bookshelf.Api/appsettings.json' })
node({ id: 'backend:file:api/src/Bookshelf.Api/Bookshelf.Api.csproj', label: 'Bookshelf.Api.csproj', kind: 'project', layer: be, role: 'config', file: 'api/src/Bookshelf.Api/Bookshelf.Api.csproj' })
const notifications = node({ id: 'backend:class:Bookshelf.Api.Features.Notifications.EmailService', label: 'EmailService', kind: 'service', layer: be, file: 'api/src/Bookshelf.Api/Features/Notifications/EmailService.cs', line: 7, tags: ['feature:notifications'] })
edge(program, authSetup, 'calls')
edge(program, dbContext, 'registers')
edge(appsettings, dbContext, 'configures', { attrs: { key: 'ConnectionStrings:Default' } })
edge(factory, program, 'uses')
const authCall = node({ id: 'frontend:symbol:web/src/services/api.ts#api.auth.me', label: 'api.auth.me', kind: 'api-call', layer: fe, parent: api, file: 'web/src/services/api.ts', line: 44, tags: ['feature:auth'], attrs: { method: 'GET', url: '/api/auth/me' } })
edge(authProvider, authCall, 'calls')
edge(authCall, me, 'http')
edge(testServer, me, 'mocks')

const snapshot = node({ id: 'database:class:Bookshelf.Api.Data.Migrations.AppDbContextModelSnapshot', label: 'AppDbContextModelSnapshot', kind: 'snapshot', layer: db, role: 'generated', file: 'api/src/Bookshelf.Api/Data/Migrations/AppDbContextModelSnapshot.cs', line: 12 })
void snapshot

node({ id: 'infra:file:.github/workflows/ci.yml', label: 'ci.yml', kind: 'workflow', layer: 'infra', role: 'tooling', file: '.github/workflows/ci.yml', attrs: { jobs: ['api', 'web', 'e2e'] } })
node({ id: 'infra:file:docker-compose.yml', label: 'docker-compose.yml', kind: 'config-file', layer: 'infra', role: 'config', file: 'docker-compose.yml', attrs: { services: ['db'] } })
node({ id: 'infra:file:README.md', label: 'README.md', kind: 'doc', layer: 'infra', role: 'docs', file: 'README.md' })

// ---------------------------------------------------------------- features
const tables: { table: string; idColumn: string }[] = []
const added: string[] = []
for (let f = 0; f < featureCount; f++) {
  const base = FEATURE_NAMES[f % FEATURE_NAMES.length]
  const name = f < FEATURE_NAMES.length ? base : `${base}${Math.floor(f / FEATURE_NAMES.length) + 1}`
  const Name = pascal(name)
  const names = plural(name)
  const Names = pascal(names)
  const tag = [`feature:${name}`]
  const webDir = `web/src/features/${names}`
  const apiDir = `api/src/Bookshelf.Api/Features/${Names}`
  const start = nodes.length

  // Frontend
  const listRoute = node({ id: `frontend:route:/${names}`, label: `/${names}`, kind: 'route', layer: fe, parent: app, file: 'web/src/App.tsx', line: 12 + f, tags: tag, attrs: { path: `/${names}` } })
  const detailRoute = node({ id: `frontend:route:/${names}/:id`, label: `/${names}/:id`, kind: 'route', layer: fe, parent: app, file: 'web/src/App.tsx', line: 13 + f, tags: tag, attrs: { path: `/${names}/:id` } })
  const listPage = node({ id: `frontend:symbol:${webDir}/${Names}Page.tsx#${Names}Page`, label: `${Names}Page`, kind: 'page', layer: fe, file: `${webDir}/${Names}Page.tsx`, line: 9, tags: tag })
  const detailPage = node({ id: `frontend:symbol:${webDir}/${Name}DetailPage.tsx#${Name}DetailPage`, label: `${Name}DetailPage`, kind: 'page', layer: fe, file: `${webDir}/${Name}DetailPage.tsx`, line: 11, tags: tag })
  const list = node({ id: `frontend:symbol:${webDir}/${Name}List.tsx#${Name}List`, label: `${Name}List`, kind: 'component', layer: fe, file: `${webDir}/${Name}List.tsx`, line: 6, tags: tag })
  const card = node({ id: `frontend:symbol:${webDir}/${Name}Card.tsx#${Name}Card`, label: `${Name}Card`, kind: 'component', layer: fe, file: `${webDir}/${Name}Card.tsx`, line: 5, tags: tag })
  const form = node({ id: `frontend:symbol:${webDir}/${Name}Form.tsx#${Name}Form`, label: `${Name}Form`, kind: 'component', layer: fe, file: `${webDir}/${Name}Form.tsx`, line: 14, tags: tag })
  const hook = node({ id: `frontend:symbol:${webDir}/use${Names}.ts#use${Names}`, label: `use${Names}`, kind: 'hook', layer: fe, file: `${webDir}/use${Names}.ts`, line: 7, tags: tag, description: `Loads and caches ${names}` })
  const dto = node({ id: `frontend:symbol:web/src/services/api.ts#${Name}Dto`, label: `${Name}Dto`, kind: 'interface', layer: fe, file: 'web/src/services/api.ts', line: 20 + f, tags: tag })
  edge(app, listRoute, 'renders')
  edge(app, detailRoute, 'renders')
  edge(listRoute, listPage, 'renders')
  edge(detailRoute, detailPage, 'renders')
  edge(listPage, list, 'renders')
  edge(list, card, 'renders')
  edge(detailPage, form, 'renders')
  edge(listPage, hook, 'uses')
  edge(detailPage, hook, 'uses')
  edge(form, useAuth, 'uses')
  edge(card, detailRoute, 'navigates')

  // Backend
  const group = node({ id: `backend:class:Bookshelf.Api.Features.${Names}.${Names}Endpoints`, label: `${Names}Endpoints`, kind: 'endpoint-group', layer: be, file: `${apiDir}/${Names}Endpoints.cs`, line: 8, tags: tag })
  const service = node({ id: `backend:class:Bookshelf.Api.Features.${Names}.${Name}Service`, label: `${Name}Service`, kind: 'service', layer: be, file: `${apiDir}/${Name}Service.cs`, line: 10, tags: tag, attrs: { lifetime: 'scoped' }, description: `Business rules for ${names}` })
  const response = node({ id: `backend:class:Bookshelf.Api.Features.${Names}.${Name}Response`, label: `${Name}Response`, kind: 'dto', layer: be, file: `${apiDir}/${Names}Endpoints.cs`, line: 5, tags: tag, attrs: { record: true } })
  const createRequest = node({ id: `backend:class:Bookshelf.Api.Features.${Names}.Create${Name}Request`, label: `Create${Name}Request`, kind: 'dto', layer: be, file: `${apiDir}/${Names}Endpoints.cs`, line: 6, tags: tag, attrs: { record: true } })
  const entity = node({ id: `backend:class:Bookshelf.Api.Data.${Name}`, label: Name, kind: 'entity', layer: be, file: `api/src/Bookshelf.Api/Data/${Name}.cs`, line: 3 })
  edge(program, group, 'calls')
  edge(program, service, 'registers')
  edge(dbContext, entity, 'exposes')
  edge(service, dbContext, 'injects')
  edge(service, entity, 'queries')
  const table = names.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
  const tableId = node({ id: `database:table:public.${table}`, label: table, kind: 'table', layer: db, file: snapshotFile(), line: 20 + f * 30, attrs: { schema: 'public', entity: `Bookshelf.Api.Data.${Name}`, primaryKey: ['id'] } })
  edge(entity, tableId, 'maps-to')
  const props = ['Id', 'Name', 'CreatedAt', ...(tables.length > 0 ? [`${pascal(tables[tables.length - 1].table.replace(/s$/, ''))}Id`] : [])]
  for (const prop of props) {
    const propertyId = node({ id: `backend:property:Bookshelf.Api.Data.${Name}.${prop}`, label: `${Name}.${prop}`, kind: 'property', layer: be, parent: entity, file: `api/src/Bookshelf.Api/Data/${Name}.cs`, line: 5 + props.indexOf(prop) })
    const column = prop.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
    const columnId = node({
      id: `database:column:public.${table}.${column}`,
      label: `${table}.${column}`,
      kind: 'column',
      layer: db,
      parent: tableId,
      file: snapshotFile(),
      line: 22 + f * 30 + props.indexOf(prop),
      attrs: { type: prop === 'Id' || prop.endsWith('Id') ? 'integer' : prop === 'CreatedAt' ? 'timestamp with time zone' : 'character varying(200)', nullable: false, ...(prop === 'Id' ? { primaryKey: true, identity: true } : {}) },
    })
    edge(propertyId, columnId, 'maps-to')
    edge(service, propertyId, prop === 'CreatedAt' ? 'writes' : 'reads')
    if (prop.endsWith('Id') && prop !== 'Id') {
      const target = tables[tables.length - 1]
      edge(columnId, `database:column:public.${target.table}.${target.idColumn}`, 'foreign-key', { attrs: { onDelete: 'Cascade' } })
    }
  }
  tables.push({ table, idColumn: 'id' })

  const routes: [string, string, string][] = [
    ['GET', `/api/${names}`, 'list'],
    ['GET', `/api/${names}/{id}`, 'get'],
    ['POST', `/api/${names}`, 'create'],
    ['PUT', `/api/${names}/{id}`, 'update'],
    ['DELETE', `/api/${names}/{id}`, 'remove'],
  ]
  for (const [method, route, action] of routes) {
    const endpoint = node({ id: `backend:route:${method} ${route}`, label: `${method} ${route}`, kind: 'endpoint', layer: be, parent: group, file: `${apiDir}/${Names}Endpoints.cs`, line: 20 + routes.findIndex((r) => r[2] === action) * 12, tags: tag, attrs: { method, route, handler: `${Names}Endpoints.${pascal(action)}`, ...(method !== 'GET' ? { auth: 'required' } : {}) } })
    const call = node({ id: `frontend:symbol:web/src/services/api.ts#api.${names}.${action}`, label: `api.${names}.${action}`, kind: 'api-call', layer: fe, parent: api, file: 'web/src/services/api.ts', line: 60 + f * 8, tags: tag, attrs: { method, url: route.replace('{id}', '${id}') } })
    edge(call, endpoint, 'http', { attrs: { method, responseType: dto } })
    edge(call, request, 'calls')
    edge(hook, call, 'calls')
    edge(endpoint, service, 'injects')
    edge(endpoint, response, 'returns')
    if (method === 'POST' || method === 'PUT') {
      edge(endpoint, createRequest, 'uses')
      edge(form, call, 'calls')
    }
    edge(testServer, endpoint, 'mocks')
  }
  edge(dto, response, 'mirrors', { confidence: 0.9 })
  if (f % 3 === 1) edge(service, notifications, 'calls', { source: 'llm', confidence: 0.62, attrs: { reason: 'sends a notification after changes (inferred)' } })

  // Tests
  const pageTest = node({ id: `frontend:file:${webDir}/${Names}Page.test.tsx`, label: `${Names}Page.test.tsx`, kind: 'test-suite', layer: fe, role: 'test/unit', file: `${webDir}/${Names}Page.test.tsx`, tags: tag, attrs: { tests: [`lists ${names}`, `shows an error when the API fails`], testCount: 2 } })
  edge(pageTest, listPage, 'tests')
  edge(pageTest, testServer, 'uses')
  const e2e = node({ id: `frontend:file:web/e2e/${names}.spec.ts`, label: `${names}.spec.ts`, kind: 'test-suite', layer: fe, role: 'test/e2e', file: `web/e2e/${names}.spec.ts`, tags: tag, attrs: { tests: [`browse ${names}`, `create a ${name}`], testCount: 2 } })
  edge(e2e, listRoute, 'tests')
  edge(e2e, `backend:route:POST /api/${names}`, 'tests')
  const unit = node({ id: `backend:class:Bookshelf.Api.UnitTests.${Name}ServiceTests`, label: `${Name}ServiceTests`, kind: 'test-suite', layer: be, role: 'test/unit', file: `api/tests/Bookshelf.Api.UnitTests/${Name}ServiceTests.cs`, line: 8, tags: tag, attrs: { tests: [`Creates ${name}`, `Rejects duplicate ${name}`, `Lists ${names} newest first`], testCount: 3 } })
  edge(unit, service, 'tests')
  edge(unit, dbContext, 'uses')
  const integration = node({ id: `backend:class:Bookshelf.Api.IntegrationTests.${Names}EndpointTests`, label: `${Names}EndpointTests`, kind: 'test-suite', layer: be, role: 'test/integration', file: `api/tests/Bookshelf.Api.IntegrationTests/${Names}EndpointTests.cs`, line: 9, tags: tag, attrs: { tests: [`Get returns 404 for unknown id`, `Post creates a ${name}`], testCount: 2 } })
  for (const [method, route] of routes.slice(0, 3)) edge(integration, `backend:route:${method} ${route}`, 'tests')
  edge(integration, factory, 'uses')

  // Migration
  const migration = node({ id: `database:class:Bookshelf.Api.Data.Migrations.Add${Names}`, label: `Add${Names}`, kind: 'migration', layer: db, role: 'migration', file: `api/src/Bookshelf.Api/Data/Migrations/2026${String(1 + f).padStart(2, '0')}01_Add${Names}.cs`, line: 9, attrs: { order: f + 1, operations: [`create table ${table}`] } })
  edge(migration, tableId, 'migrates', { attrs: { operations: ['create table'] } })

  if (f === featureCount - 1 && featureCount > 2) added.push(...nodes.slice(start).map((n) => n.id))
}

// A call to an endpoint that doesn't exist, to show unresolved links.
const exportCall = node({ id: 'frontend:symbol:web/src/services/api.ts#api.reports.export', label: 'api.reports.export', kind: 'api-call', layer: fe, parent: api, file: 'web/src/services/api.ts', line: 210, attrs: { method: 'GET', url: '/api/reports/export' } })
unresolved.push({ from: exportCall, type: 'http', target: 'GET /api/reports/export', reason: 'no endpoint matches this request', evidence: [{ file: 'web/src/services/api.ts', line: 212 }] })

function snapshotFile(): string {
  return 'api/src/Bookshelf.Api/Data/Migrations/AppDbContextModelSnapshot.cs'
}

// ---------------------------------------------------------------- layout + write
for (const n of nodes) n.roleReason ??= 'synthetic demo'
const kinds = new Map(config.kinds.map((k) => [k.id, k]))
const started = performance.now()
const positions = computeLayout(
  nodes.map((n) => ({ id: n.id, layer: n.layer, role: n.role, parent: n.parent, tags: n.tags, size: kinds.get(n.kind)?.size, kind: n.kind })),
  edges,
  {
    ...vocabularyOptions(config.layers, config.roles),
    layerGap: config.layout.layerGap,
    seed: config.layout.seed,
  },
)
for (const n of nodes) n.pos = positions.get(n.id)
const layoutMs = Math.round(performance.now() - started)

const graph: RepoGraph = {
  version: 1,
  meta: {
    tool: { name: 'repomap', version: JSON.parse(readFileSync(join(TOOL_ROOT, 'package.json'), 'utf8')).version },
    repo: { name: featureCount > 12 ? `bookshelf (${featureCount} features)` : 'bookshelf (demo)', branch: 'main', commit: 'demo' },
    generatedAt: new Date('2026-09-30T09:00:00Z').toISOString(),
    layers: config.layers,
    roles: config.roles,
    kinds: config.kinds,
    edgeTypes: config.edgeTypes,
    presets: config.presets,
    layout: { algorithm: 'layered-force', layerGap: config.layout.layerGap, seed: config.layout.seed },
    changes: added.length > 0 ? { since: '2026-09-29T17:30:00Z', previousCommit: 'demo~1', addedNodes: added, removedNodes: [], addedEdges: added.length * 2, removedEdges: 0 } : undefined,
    stats: { nodes: nodes.length, edges: edges.length, unresolved: unresolved.length },
  },
  nodes: nodes.sort((a, b) => (a.id < b.id ? -1 : 1)),
  edges,
  unresolved,
}
if (!graph.meta.changes) delete graph.meta.changes
const out = resolve(values.out!)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, stringifyGraph(graph))
process.stderr.write(`wrote ${out}: ${nodes.length} nodes, ${edges.length} edges (layout ${layoutMs} ms)\n`)
