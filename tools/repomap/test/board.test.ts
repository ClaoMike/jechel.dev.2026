/**
 * The Board: feature assignment, rules, review diffs, the levels (model), their layout (ELK), the AI
 * work (with the fake API) and the server's review route and network token.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import ELK from 'elkjs/lib/elk.bundled.js'
import { parseJsonReply, reviewBriefing, summarizeBoard } from '../src/core/ai/board-ai.ts'
import { SettingsStore } from '../src/core/ai/settings.ts'
import { buildBoard, readAiFile, summaryTargets } from '../src/core/board.ts'
import type { RepoMapConfig } from '../src/core/config.ts'
import { startServer, type ServerHandle } from '../src/core/serve.ts'
import { assignFeatures, caseLabel, checkRules, isConditional, memberAt, resolveTiers, type RuleDef } from '../src/shared/board.ts'
import { parseUnifiedDiff, touchedNodes } from '../src/shared/review.ts'
import type { GraphEdge, GraphNode, RepoGraph } from '../src/shared/types.ts'
import { layoutScene, wirePath, type ElkLike } from '../viewer/src/board/layout.ts'
import { buildScene, chipGroups, chipsIn, indexBoard, parentPath, pathOfNode, type BoardPath } from '../viewer/src/board/model.ts'
import { computeImpact } from '../viewer/src/board/impact.ts'
import { indexGraph } from '../viewer/src/model/graph.ts'
import { FakeAnthropic } from './fake-anthropic.ts'

const n = (id: string, kind: string, layer: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id, label: id.split(':').pop()!, kind, layer, role: 'production', pos: [0, 0, 0], ...extra })
const e = (from: string, type: string, to: string, extra: Partial<GraphEdge> = {}): GraphEdge => ({ from, to, type, source: 'static', confidence: 1, ...extra })

/** A small app: a contact feature across three tiers, an orders feature, a shared button and a test. */
function sample(): RepoGraph {
  const nodes: GraphNode[] = [
    n('views:c:ContactForm', 'component', 'views', {
      file: 'web/src/features/contact/ContactForm.tsx',
      line: 1,
      endLine: 20,
      tags: ['feature:contact'],
      attrs: { members: [{ name: 'submit', kind: 'function', line: 5, endLine: 9 }, { name: 'title', kind: 'prop', line: 2, endLine: 2 }] },
    }),
    n('model:c:api', 'api-client', 'model', { file: 'web/src/services/api.ts', line: 1, endLine: 40 }),
    n('model:c:api.contact.send', 'api-call', 'model', { parent: 'model:c:api', file: 'web/src/services/api.ts', line: 3, endLine: 5, tags: ['feature:contact'] }),
    n('model:c:api.orders.list', 'api-call', 'model', { parent: 'model:c:api', file: 'web/src/services/api.ts', line: 7, endLine: 9, tags: ['feature:orders'] }),
    n('views:c:Button', 'component', 'views', { file: 'web/src/components/Button.tsx', line: 1, endLine: 5 }),
    n('views:c:OrdersPage', 'page', 'views', {
      file: 'web/src/features/orders/OrdersPage.tsx',
      line: 1,
      endLine: 10,
      tags: ['feature:orders'],
      attrs: { shows: [{ tag: 'p', className: 'muted', content: '{texts.empty}', case: { if: ['rows.length === 0'], line: 6 } }] },
    }),
    n('views:c:OrderRow', 'component', 'views', { file: 'web/src/features/orders/OrderRow.tsx', line: 1, endLine: 10 }),
    n('api:g:ContactEndpoints', 'endpoint-group', 'api', { file: 'api/Features/Contact/ContactEndpoints.cs', line: 1, endLine: 30, tags: ['feature:contact'] }),
    n('api:e:POST /api/contact', 'endpoint', 'api', { parent: 'api:g:ContactEndpoints', file: 'api/Features/Contact/ContactEndpoints.cs', line: 5, endLine: 12, tags: ['feature:contact'] }),
    n('api:e:GET /api/orders', 'endpoint', 'api', { file: 'api/Features/Orders/OrdersEndpoints.cs', line: 1, endLine: 8, tags: ['feature:orders'] }),
    n('api:c:Message', 'entity', 'api', { file: 'api/Data/Message.cs', line: 1, endLine: 10 }),
    n('db:t:messages', 'table', 'db'),
    n('db:col:messages.body', 'column', 'db', { parent: 'db:t:messages' }),
    n('views:f:ContactForm.test.tsx', 'test-suite', 'views', { role: 'test/unit', file: 'web/src/features/contact/ContactForm.test.tsx' }),
  ]
  const edges: GraphEdge[] = [
    e('views:c:ContactForm', 'calls', 'model:c:api.contact.send', { evidence: [{ file: 'web/src/features/contact/ContactForm.tsx', line: 7 }] }),
    e('views:c:ContactForm', 'renders', 'views:c:Button'),
    e('views:c:OrdersPage', 'renders', 'views:c:Button'),
    e('views:c:OrdersPage', 'renders', 'views:c:OrderRow', { attrs: { when: [{ if: ["state.status === 'loaded'"], each: 'rows', reads: [{ name: 'state', from: 'useOrders' }], line: 4 }] } }),
    e('views:c:OrdersPage', 'calls', 'model:c:api.orders.list'),
    e('model:c:api.contact.send', 'http', 'api:e:POST /api/contact'),
    e('model:c:api.orders.list', 'http', 'api:e:GET /api/orders'),
    e('api:e:POST /api/contact', 'writes', 'api:c:Message'),
    e('api:e:GET /api/orders', 'queries', 'api:c:Message'),
    e('api:c:Message', 'maps-to', 'db:t:messages'),
    e('views:f:ContactForm.test.tsx', 'tests', 'views:c:ContactForm'),
    e('model:c:api', 'contains', 'model:c:api.contact.send'),
  ]
  return {
    version: 1,
    meta: {
      tool: { name: 'repomap', version: 'test' },
      repo: { name: 'shop' },
      generatedAt: '2026-01-01T00:00:00Z',
      layers: [
        { id: 'views', label: 'Views', color: '#38bdf8' },
        { id: 'model', label: 'Model', color: '#22d3ee' },
        { id: 'api', label: 'API', color: '#4ade80' },
        { id: 'db', label: 'Database', color: '#fb923c' },
      ],
      roles: [
        { id: 'production', label: 'Production', color: '#fff' },
        { id: 'test', label: 'Tests', color: '#f00' },
        { id: 'test/unit', label: 'Unit', color: '#f00', parent: 'test' },
      ],
      kinds: [],
      edgeTypes: [],
      presets: [],
    },
    nodes,
    edges,
    unresolved: [],
  }
}

const TIERS = [
  { id: 'web', label: 'Frontend', color: '#38bdf8', layers: ['views', 'model'] },
  { id: 'server', label: 'Backend', color: '#4ade80', layers: ['api'] },
]

function withBoard(graph: RepoGraph, rules: RuleDef[] = []): RepoGraph {
  const assigned = assignFeatures(graph.nodes, graph.edges)
  for (const node of graph.nodes) node.feature = assigned.get(node.id)!.feature
  const tiers = resolveTiers(graph.meta.layers, TIERS)
  graph.board = {
    tiers,
    features: [
      { id: 'contact', label: 'Contact', color: '#f00' },
      { id: 'orders', label: 'Orders', color: '#0f0' },
      { id: 'shared', label: 'Shared', color: '#999' },
    ],
    rules,
    violations: checkRules(graph.nodes, graph.edges, tiers, rules, (id) => graph.nodes.find((x) => x.id === id)?.feature),
  }
  return graph
}

describe('features', () => {
  it('comes from folders, then parents, then neighbours; the rest is shared', () => {
    const graph = sample()
    const features = assignFeatures(graph.nodes, graph.edges)
    const of = (id: string) => features.get(id)
    assert.deepEqual(of('views:c:ContactForm'), { feature: 'contact', source: 'path' })
    // Children placed by folder keep their own; the parent has none of its own.
    assert.equal(of('model:c:api.orders.list')?.feature, 'orders')
    // Used by contact and orders alike: shared.
    assert.deepEqual(of('views:c:Button'), { feature: 'shared', source: 'shared' })
    assert.equal(of('model:c:api')?.feature, 'shared')
    // Only orders uses it: it joins orders.
    assert.deepEqual(of('views:c:OrderRow'), { feature: 'orders', source: 'derived' })
    // Its only writer is contact's endpoint, but orders queries it too: shared.
    assert.equal(of('api:c:Message')?.feature, 'shared')
    // A test takes its subject's feature.
    assert.equal(of('views:f:ContactForm.test.tsx')?.feature, 'contact')
    // A column follows its table.
    assert.equal(of('db:col:messages.body')?.feature, of('db:t:messages')?.feature)
  })

  it('config and the AI place nodes too; aliases merge features', () => {
    const graph = sample()
    const features = assignFeatures(graph.nodes, graph.edges, {
      aliases: { orders: 'shop' },
      manual: new Map([['views:c:Button', 'design']]),
      llm: new Map([['api:c:Message', 'contact']]),
    })
    assert.deepEqual(features.get('views:c:Button'), { feature: 'design', source: 'manual' })
    assert.deepEqual(features.get('api:c:Message'), { feature: 'contact', source: 'llm' })
    assert.equal(features.get('views:c:OrdersPage')?.feature, 'shop')
    assert.equal(features.get('db:t:messages')?.feature, 'contact', 'the table follows the entity now')
  })

  it('groups layers into tiers, keeping their order', () => {
    const tiers = resolveTiers(sample().meta.layers, TIERS)
    assert.deepEqual(tiers.map((t) => [t.id, t.layers]), [['web', ['views', 'model']], ['server', ['api']], ['db', ['db']]])
  })

  it('finds the member whose code holds a line', () => {
    const form = sample().nodes[0]
    assert.equal(memberAt(form, 7)?.name, 'submit')
    assert.equal(memberAt(form, 2)?.name, 'title')
    assert.equal(memberAt(form, 15), undefined)
  })
})

describe('an API service as its own feature', () => {
  it('a hub feature keeps its nodes but pulls none of its neighbours in', () => {
    // A store hook that only the API's call and contact's form use: it joins contact, not the API.
    const graph = sample()
    graph.nodes.push(n('model:c:contactApi', 'store-api', 'model', { file: 'web/src/store/contactApi.ts', line: 1, endLine: 9 }))
    graph.edges.push(e('model:c:contactApi', 'calls', 'model:c:api.contact.send'), e('views:c:ContactForm', 'uses', 'model:c:contactApi'))
    const manual = new Map(graph.nodes.filter((x) => x.file === 'web/src/services/api.ts').map((x) => [x.id, 'api']))
    const pulled = assignFeatures(graph.nodes, graph.edges, { manual })
    assert.equal(pulled.get('model:c:api.contact.send')?.feature, 'api')
    const hub = assignFeatures(graph.nodes, graph.edges, { manual, hubs: ['api'] })
    assert.equal(hub.get('model:c:api.contact.send')?.feature, 'api')
    assert.equal(hub.get('model:c:contactApi')?.feature, 'contact')
  })

  it('a rule can name every feature but some: only the API calls the backend', () => {
    const rule: RuleDef = { id: 'only-the-api', description: '', from: { tiers: ['web'], notFeatures: ['contact'] }, to: { tiers: ['server'] }, edgeTypes: ['http'], deny: true }
    const graph = withBoard(sample(), [rule])
    // contact.send is contact's (allowed); orders.list is orders' (not).
    assert.deepEqual(graph.board!.violations!.map((v) => v.from), ['model:c:api.orders.list'])
  })
})

describe('rules', () => {
  it('denies edges, and keeps calls inside a feature', () => {
    const rules: RuleDef[] = [
      { id: 'no-db-from-views', description: '', from: { layers: ['views'] }, to: { kinds: ['api-call'] }, deny: true, severity: 'error' },
      { id: 'own-tables', description: '', from: { tiers: ['server'] }, to: { kinds: ['entity'] }, edgeTypes: ['writes', 'queries'], sameFeature: true },
    ]
    const graph = withBoard(sample(), rules)
    const violations = graph.board!.violations!
    assert.deepEqual(violations.filter((v) => v.rule === 'no-db-from-views').map((v) => v.from).sort(), ['views:c:ContactForm', 'views:c:OrdersPage'])
    assert.equal(violations.find((v) => v.rule === 'no-db-from-views')?.severity, 'error')
    // Message is shared: reaching shared is allowed.
    assert.equal(violations.filter((v) => v.rule === 'own-tables').length, 0)
    graph.nodes.find((x) => x.id === 'api:c:Message')!.feature = 'contact'
    const again = checkRules(graph.nodes, graph.edges, graph.board!.tiers, rules, (id) => graph.nodes.find((x) => x.id === id)?.feature)
    assert.deepEqual(again.filter((v) => v.rule === 'own-tables').map((v) => v.from), ['api:e:GET /api/orders'])
  })
})

describe('review diffs', () => {
  const diff = [
    'diff --git a/web/src/features/contact/ContactForm.tsx b/web/src/features/contact/ContactForm.tsx',
    'index 1..2 100644',
    '--- a/web/src/features/contact/ContactForm.tsx',
    '+++ b/web/src/features/contact/ContactForm.tsx',
    '@@ -6,2 +6,3 @@ x',
    '-old',
    '+new',
    '+newer',
    'diff --git a/web/src/services/api.ts b/web/src/services/api.ts',
    '--- a/web/src/services/api.ts',
    '+++ b/web/src/services/api.ts',
    '@@ -8 +7,0 @@',
    '-gone',
    'diff --git a/api/New.cs b/api/New.cs',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/api/New.cs',
    '@@ -0,0 +1,2 @@',
    '+a',
    '+b',
    'diff --git a/old.ts b/new.ts',
    'similarity index 90%',
    'rename from old.ts',
    'rename to new.ts',
  ].join('\n')

  it('parses files, statuses and changed line ranges', () => {
    const files = parseUnifiedDiff(diff)
    assert.deepEqual(
      files.map((f) => [f.path, f.status, f.added, f.removed, f.ranges]),
      [
        ['web/src/features/contact/ContactForm.tsx', 'modified', 2, 1, [[6, 8]]],
        ['web/src/services/api.ts', 'modified', 0, 1, [[7, 7]]],
        ['api/New.cs', 'added', 2, 0, [[1, 2]]],
        ['new.ts', 'renamed', 0, 0, []],
      ],
    )
    assert.equal(files[3].oldPath, 'old.ts')
  })

  it('touches the innermost nodes whose lines changed', () => {
    const touched = touchedNodes(sample().nodes, parseUnifiedDiff(diff))
    assert.equal(touched.get('views:c:ContactForm'), 'lines')
    // Line 7 of api.ts lies in api.orders.list (7–9), inside api (1–40): only the call.
    assert.equal(touched.get('model:c:api.orders.list'), 'lines')
    assert.equal(touched.has('model:c:api'), false)
    assert.equal(touched.has('model:c:api.contact.send'), false)
  })

  it('finds what depends on a change and the tests that cover it', () => {
    const graph = withBoard(sample())
    const bi = indexBoard(indexGraph(graph))
    const at = (id: string) => bi.index.byId.get(id)!
    const { impacted, tests } = computeImpact(bi, new Set([at('api:c:Message')]))
    // Message ← endpoints (1 step) ← API client (2 steps). Not further.
    assert.ok(impacted.has(at('api:g:ContactEndpoints')))
    assert.ok(impacted.has(at('api:e:GET /api/orders')))
    assert.ok(impacted.has(at('model:c:api')))
    assert.ok(!impacted.has(at('views:c:ContactForm')), 'three steps away')
    assert.deepEqual(tests, [])
    const form = computeImpact(bi, new Set([at('views:c:ContactForm')]))
    assert.deepEqual(form.tests.map((i) => bi.index.nodes[i].label), ['ContactForm.test.tsx'])
  })
})

describe('board levels', () => {
  const graph = withBoard(sample(), [{ id: 'no-calls', description: '', from: { layers: ['views'] }, to: { kinds: ['api-call'] }, deny: true }])
  const bi = indexBoard(indexGraph(graph))
  const options = { showHidden: false, typeLinks: false }
  const scene = (path: BoardPath) => buildScene(bi, path, options)

  it('starts with the app, then the tiers wired together', () => {
    assert.deepEqual(scene({ level: 'app' }).chips.map((c) => c.label), ['shop'])
    const tiers = scene({ level: 'tiers' })
    assert.deepEqual(tiers.chips.map((c) => c.id), ['web', 'server', 'db'])
    const web = tiers.wires.find((w) => w.from === 'web' && w.to === 'server')!
    assert.deepEqual(web.types, { http: 2 })
    assert.equal(tiers.chips[0].violations, 2)
  })

  it('a tier shows its features, with connectors to the other tiers', () => {
    const features = scene({ level: 'features', tier: 'web' })
    const chips = features.chips.filter((c) => c.kind === 'feature').map((c) => c.id)
    assert.deepEqual(chips, ['f:contact', 'f:orders', 'f:shared'])
    const out = features.chips.find((c) => c.kind === 'connector')!
    assert.equal(out.id, 'out:server')
    assert.equal(out.side, 'out')
    assert.ok(features.wires.some((w) => w.from === 'f:contact' && w.to === 'out:server'))
    assert.ok(features.wires.some((w) => w.from === 'f:orders' && w.to === 'f:shared'), 'orders renders the shared button')
  })

  it('a feature shows its chips; shared parents only with this feature’s pins; wires leave from the member', () => {
    const contact = scene({ level: 'chips', tier: 'web', feature: 'contact' })
    const ids = contact.chips.filter((c) => c.kind === 'node').map((c) => c.label).sort()
    // Button is Shared's, but ContactForm renders it: it's on Contact's board too, faded, saying where it lives.
    assert.deepEqual(ids, ['Button', 'ContactForm', 'api'])
    const button = contact.chips.find((c) => c.label === 'Button')!
    assert.equal(button.ghost, true)
    assert.match(button.sub ?? '', /Shared/)
    assert.ok(contact.wires.some((w) => w.from === 'views:c:ContactForm' && w.to === 'views:c:Button'))
    const api = contact.chips.find((c) => c.label === 'api')!
    assert.equal(api.ghost, true)
    assert.deepEqual(api.pins.map((p) => p.label), ['contact.send'])
    const call = contact.wires.find((w) => w.from === 'views:c:ContactForm' && w.to === 'model:c:api')!
    assert.ok(call.fromPin?.startsWith('m:submit'), 'the call is in submit()')
    assert.ok(call.toPin?.startsWith('n:'))
    assert.equal(call.violation, true)
    // The test is hidden unless asked for.
    assert.ok(!contact.chips.some((c) => c.label === 'ContactForm.test.tsx'))
    const all = buildScene(bi, { level: 'chips', tier: 'web', feature: 'contact' }, { showHidden: true, typeLinks: false })
    assert.ok(all.chips.some((c) => c.label === 'ContactForm.test.tsx'))
  })

  it('a chip shows every member, and its neighbours as connectors that lead to them', () => {
    const form = scene({ level: 'chip', tier: 'web', feature: 'contact', chip: 'views:c:ContactForm' })
    assert.deepEqual(form.chips[0].pins.map((p) => p.label).sort(), ['submit', 'title'])
    const out = form.chips.filter((c) => c.side === 'out').map((c) => c.label).sort()
    assert.deepEqual(out, ['Button', 'api'])
    const button = form.chips.find((c) => c.label === 'Button')!
    assert.deepEqual(button.enter, pathOfNode(bi, bi.index.byId.get('views:c:Button')!, options))
  })

  it('dashes wires only where states are drawn, not on the overviews', () => {
    for (const path of [{ level: 'app' }, { level: 'tiers' }, { level: 'features', tier: 'web' }] as BoardPath[]) {
      assert.ok(scene(path).wires.every((w) => !w.conditional), path.level)
    }
  })

  it('draws a render that happens only in some state as a conditional wire', () => {
    const orders = scene({ level: 'chips', tier: 'web', feature: 'orders' })
    assert.equal(orders.wires.find((w) => w.to === 'views:c:OrderRow')!.conditional, true)
    assert.equal(orders.wires.find((w) => w.to.includes('Button') || w.to === 'in:f:shared' || w.to.endsWith('shared'))?.conditional ?? false, false)
    const row = graph.edges.find((x) => x.to === 'views:c:OrderRow')!
    assert.ok(isConditional(row))
    assert.ok(!isConditional(graph.edges.find((x) => x.from === 'views:c:OrdersPage' && x.to === 'views:c:Button')!))
    // Through the state it happens in: OrdersPage → [the state] → OrderRow, with the condition and what it reads.
    const state = orders.chips.find((c) => c.kind === 'state')!
    assert.equal(state.label, "for each of rows, when state.status === 'loaded'")
    assert.equal(state.sub, 'state ← useOrders')
    assert.equal(state.owner, bi.index.byId.get('views:c:OrdersPage'))
    assert.ok(orders.wires.some((w) => w.from === 'views:c:OrdersPage' && w.to === state.id))
    assert.ok(orders.wires.some((w) => w.from === state.id && w.to === 'views:c:OrderRow'))
    assert.ok(!orders.wires.some((w) => w.from === 'views:c:OrdersPage' && w.to === 'views:c:OrderRow'))
    // A plain element it shows only then is listed on its state's chip.
    const empty = orders.chips.find((c) => c.kind === 'state' && c.label === 'rows.length === 0')!
    assert.deepEqual(empty.pins.map((p) => p.label), ['<p.muted> {texts.empty}'])
    assert.ok(orders.wires.some((w) => w.from === 'views:c:OrdersPage' && w.to === empty.id))
    const flat = buildScene(bi, { level: 'chips', tier: 'web', feature: 'orders' }, { ...options, states: false })
    assert.ok(!flat.chips.some((c) => c.kind === 'state'))
    assert.ok(flat.wires.some((w) => w.from === 'views:c:OrdersPage' && w.to === 'views:c:OrderRow'))
    assert.equal(caseLabel({ if: [], line: 1 }), 'always')
    assert.equal(caseLabel({ if: ['a', 'b'], each: 'rows', line: 1 }), 'for each of rows, when a && b')
  })

  it('a feature shows its top components and what they render; deeper ones are on the board of the one rendering them', () => {
    const deep = sample()
    deep.nodes.push(
      n('views:c:OrderCell', 'component', 'views', { file: 'web/src/features/orders/OrderCell.tsx', line: 1, endLine: 5, tags: ['feature:orders'] }),
      n('views:c:useCellFormat', 'hook', 'views', { file: 'web/src/features/orders/useCellFormat.ts', line: 1, endLine: 5, tags: ['feature:orders'] }),
      n('views:c:Icon', 'component', 'views', { file: 'web/src/components/Icon.tsx', line: 1, endLine: 5 }),
    )
    deep.edges.push(
      e('views:c:OrderRow', 'renders', 'views:c:OrderCell'),
      e('views:c:OrderCell', 'uses', 'views:c:useCellFormat'),
      e('views:c:OrderRow', 'renders', 'views:c:Icon'),
    )
    const dbi = indexBoard(indexGraph(withBoard(deep)))
    const orders = buildScene(dbi, { level: 'chips', tier: 'web', feature: 'orders' }, options)
    const labels = orders.chips.filter((c) => c.kind === 'node').map((c) => c.label)
    assert.ok(labels.includes('OrdersPage') && labels.includes('OrderRow'), 'the page and what it renders')
    for (const deeper of ['OrderCell', 'useCellFormat', 'Icon']) assert.ok(!labels.includes(deeper), `${deeper} is on OrderRow's board`)
    assert.ok(!orders.chips.some((c) => c.id === 'out:orders' || c.id === 'in:orders'), 'no connector back into its own feature')
    // OrderRow's board leads to them; OrderCell's says who renders it.
    const row = buildScene(dbi, { level: 'chip', tier: 'web', feature: 'orders', chip: 'views:c:OrderRow' }, options)
    assert.ok(row.chips.some((c) => c.label === 'OrderCell' && c.side === 'out'))
    assert.ok(row.chips.some((c) => c.label === 'Icon' && c.side === 'out'))
    const cell = buildScene(dbi, { level: 'chip', tier: 'web', feature: 'orders', chip: 'views:c:OrderCell' }, options)
    assert.ok(cell.chips.some((c) => c.label === 'OrderRow' && c.side === 'in'))
  })

  it('goes up level by level', () => {
    let path: BoardPath | null = { level: 'chip', tier: 'web', feature: 'contact', group: 'x', chip: 'views:c:ContactForm' }
    const levels: string[] = []
    while (path) {
      levels.push(path.level + ('group' in path && path.group ? '+group' : ''))
      path = parentPath(path)
    }
    assert.deepEqual(levels, ['chip+group', 'chips+group', 'chips', 'features', 'tiers', 'app'])
  })

  it('opens a big feature on its page when what it shows (the page and what that renders) fits', () => {
    const big = sample()
    for (let k = 0; k < 45; k++) {
      big.nodes.push(n(`views:c:Deep${k}`, 'component', 'views', { file: `web/src/features/orders/parts/Deep${k}.tsx`, line: 1, endLine: 3, tags: ['feature:orders'] }))
      big.edges.push(e('views:c:OrderRow', 'renders', `views:c:Deep${k}`))
    }
    const bbi = indexBoard(indexGraph(withBoard(big)))
    const orders = buildScene(bbi, { level: 'chips', tier: 'web', feature: 'orders' }, options)
    assert.ok(!orders.chips.some((c) => c.kind === 'group'), 'no folders')
    assert.ok(orders.chips.some((c) => c.label === 'OrdersPage'))
    assert.ok(!orders.chips.some((c) => c.label.startsWith('Deep')), 'what OrderRow renders is on its board')
    assert.equal(pathOfNode(bbi, bbi.index.byId.get('views:c:Deep3')!, options).level, 'chip')
    assert.equal((pathOfNode(bbi, bbi.index.byId.get('views:c:Deep3')!, options) as { group?: string }).group, undefined)
  })

  it('splits a big feature by its own folders', () => {
    const chips = chipsIn(bi, 'web', 'orders', options)
    const groups = chipGroups(bi, chips, 'orders')
    assert.equal(groups.size, chips.length)
    for (const [c, group] of groups) {
      if (bi.index.nodes[c].file?.includes('/features/orders/')) assert.equal(group, '(feature folder)')
    }
  })

  it('lays every level out with orthogonal wires that start and end on the chips', async () => {
    // The bundled build is CommonJS: its default export is the class itself.
    const elk = new (ELK as unknown as new () => ElkLike)()
    for (const path of [{ level: 'tiers' }, { level: 'features', tier: 'web' }, { level: 'chips', tier: 'web', feature: 'contact' }, { level: 'chip', tier: 'web', feature: 'contact', chip: 'views:c:ContactForm' }] as BoardPath[]) {
      const s = scene(path)
      const layout = await layoutScene(s, elk)
      assert.equal(layout.chips.size, s.chips.length, path.level)
      for (const wire of s.wires) {
        const points = layout.wires.get(wire.id)!
        assert.ok(points.length >= 2, `${path.level}: ${wire.id}`)
        for (let k = 1; k < points.length; k++) {
          const horizontal = Math.abs(points[k].y - points[k - 1].y) < 0.5
          const vertical = Math.abs(points[k].x - points[k - 1].x) < 0.5
          assert.ok(horizontal || vertical, `${path.level}: ${wire.id} is orthogonal`)
        }
        assert.ok(wirePath(points).startsWith('M'))
      }
    }
    const portrait = await layoutScene(scene({ level: 'features', tier: 'web' }), elk, { portrait: true })
    assert.ok(portrait.height > 0)
  })
})

// ---------------------------------------------------------------- builder, AI and server

const sandbox = mkdtempSync(join(tmpdir(), 'repomap-board-'))
const fake = new FakeAnthropic()
const settings = new SettingsStore(join(sandbox, 'settings.json'), { ANTHROPIC_API_KEY: 'sk-ant-test-1234567890' })

function config(root: string): RepoMapConfig {
  return {
    repoRoot: root,
    rules: [],
    board: { tiers: TIERS, featureLabels: { contact: 'Contact us' }, featureAliases: {}, featureOverrides: { 'web/src/components/**': 'design' } },
    ai: { file: join(root, 'repomap.ai.json'), summaryModel: 'claude-haiku-4-5', reviewModel: 'claude-opus-5-5' },
  } as unknown as RepoMapConfig
}

before(async () => {
  await fake.start()
})
after(async () => {
  await fake.close()
})

describe('builder and AI', () => {
  const root = join(sandbox, 'ai')
  before(() => {
    mkdirSync(join(root, 'web/src/features/contact'), { recursive: true })
    writeFileSync(join(root, 'web/src/features/contact/ContactForm.tsx'), Array.from({ length: 20 }, (_, k) => `line ${k + 1}`).join('\n'))
  })

  it('places nodes, labels features and marks summaries whose code changed', () => {
    const graph = sample()
    const cfg = config(root)
    writeFileSync(cfg.ai.file, JSON.stringify({ version: 1, features: {}, summaries: { 'views:c:ContactForm': { text: 'old', hash: 'nope' } } }))
    const board = buildBoard(cfg, graph.nodes, graph.edges, graph.meta.layers)
    assert.equal(graph.nodes.find((x) => x.id === 'views:c:Button')?.feature, 'design')
    assert.equal(board.features.find((f) => f.id === 'contact')?.label, 'Contact us')
    assert.equal(board.features.at(-1)?.id, 'shared')
    assert.equal(board.summaries?.['views:c:ContactForm'].stale, true)
  })

  it('summarizes bottom-up and only redoes what changed', async () => {
    const cfg = config(root)
    writeFileSync(cfg.ai.file, JSON.stringify({ version: 1, features: {}, summaries: {} }))
    const rebuild = async () => {
      const g = sample()
      g.board = buildBoard(cfg, g.nodes, g.edges, g.meta.layers)
      return g
    }
    const first = await rebuild()
    const targets = summaryTargets(first.nodes, first.board!.tiers, () => 'code')
    const chips = targets.filter((t) => t.level === 'chip')
    // Answer every call from what it asks about.
    const answer = (body: Record<string, unknown>) => {
      const prompt = JSON.stringify(body.messages)
      if (prompt.includes('Features: ')) return { content: [{ type: 'text' as const, text: '{"views:c:Button": "shared"}' }] }
      if (prompt.includes('{\\"summary\\"')) return { content: [{ type: 'text' as const, text: '{"summary": "The whole thing."}' }] }
      const keys = [...prompt.matchAll(/### ([^\\]+?)\\n/g)].map((m) => m[1])
      return { content: [{ type: 'text' as const, text: JSON.stringify(Object.fromEntries(keys.map((k) => [k, `About ${k}`]))) }] }
    }
    for (let k = 0; k < 40; k++) fake.reply((r) => answer(r.body))
    const before = fake.messages.length
    const result = await summarizeBoard(cfg, { settings, baseURL: fake.url, rebuild })
    assert.equal(result.failed, 0)
    const ai = readAiFile(cfg.ai.file)
    for (const chip of chips) assert.match(ai.summaries[chip.key]?.text ?? '', /^About /, chip.key)
    assert.equal(ai.summaries.app?.text, 'The whole thing.')
    assert.ok(Object.keys(ai.summaries).some((k) => k.startsWith('feature:contact@')))
    const calls = fake.messages.length - before
    assert.ok(calls > 0)
    // Nothing changed: nothing to do.
    const again = await summarizeBoard(cfg, { settings, baseURL: fake.url, rebuild, place: false })
    assert.equal(again.written, 0)
    assert.equal(fake.messages.length - before, calls)
    fake.clear()
  })

  it('reads JSON out of chatty replies', () => {
    assert.deepEqual(parseJsonReply('Sure!\n```json\n{"a": 1}\n```'), { a: 1 })
    assert.deepEqual(parseJsonReply('[{"id": "x"}]'), [{ id: 'x' }])
    assert.throws(() => parseJsonReply('no json here'))
  })

  it('briefs a review with the map’s context', async () => {
    fake.reply({ content: [{ type: 'text', text: '## What it does\nAdds a field.' }] })
    const graph = withBoard(sample())
    const markdown = await reviewBriefing(
      config(root),
      graph,
      { diff: { base: 'main', head: 'x', label: 'x against main', files: [{ path: 'a.ts', status: 'modified', added: 1, removed: 0, ranges: [[1, 1]] }], patch: '+field' }, touched: ['views:c:ContactForm'], impacted: [], tests: [] },
      { settings, baseURL: fake.url },
    )
    assert.match(markdown, /Adds a field/)
    const sent = JSON.stringify(fake.messages.at(-1)!.body)
    assert.match(sent, /ContactForm/)
    assert.match(sent, /\+field/)
    assert.equal(fake.messages.at(-1)!.body.model, 'claude-opus-5-5')
  })
})

describe('server: review and the network token', () => {
  const root = join(sandbox, 'server-repo')
  let server: ServerHandle
  let lan: ServerHandle
  const get = (url: string, path: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }>((resolveGet, reject) => {
      const req = request(`${url}${path}`, { headers }, (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => resolveGet({ status: res.statusCode ?? 0, headers: res.headers, text }))
      })
      req.on('error', reject)
      req.end()
    })

  before(async () => {
    mkdirSync(root, { recursive: true })
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
    git('init', '--quiet', '-b', 'main')
    git('config', 'user.email', 't@example.com')
    git('config', 'user.name', 'T')
    writeFileSync(join(root, 'a.ts'), 'one\ntwo\nthree\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'first')
    writeFileSync(join(root, 'a.ts'), 'one\nTWO\nthree\n')
    writeFileSync(join(root, 'new.ts'), 'x\n')
    const graph = withBoard(sample())
    graph.meta.repo.root = root
    writeFileSync(join(sandbox, 'graph.json'), JSON.stringify(graph))
    const common = { graphPath: join(sandbox, 'graph.json'), repoRoot: root, port: 0, distDir: sandbox }
    server = await startServer({ ...common, host: '127.0.0.1' })
    lan = await startServer({ ...common, host: '127.0.0.1', token: 'secret-token-123' })
  })
  after(async () => {
    await server.close()
    await lan.close()
  })

  it('reads the uncommitted changes, untracked files included, even read-only', async () => {
    const response = await get(server.url, '/api/review?head=WORKTREE')
    assert.equal(response.status, 200)
    const diff = JSON.parse(response.text) as { label: string; files: { path: string; ranges: number[][] }[]; patch?: string }
    assert.equal(diff.label, 'Uncommitted changes')
    assert.deepEqual(diff.files.map((f) => [f.path, f.ranges]), [['a.ts', [[2, 2]]], ['new.ts', [[1, 2]]]])
    assert.equal(diff.patch, undefined, 'the patch only when asked')
    assert.ok(JSON.parse((await get(server.url, '/api/review?head=WORKTREE&patch=1')).text).patch.includes('+TWO'))
  })

  it('refuses revisions git could read as options', async () => {
    for (const bad of ['--output=x', 'a..b', 'x;rm']) assert.equal((await get(server.url, `/api/review?head=${encodeURIComponent(bad)}`)).status, 400, bad)
  })

  it('lets other machines in only with the token, then by cookie', async () => {
    const lanHost = { Host: '192.168.1.20:5199' }
    assert.equal((await get(lan.url, '/graph.json', lanHost)).status, 401)
    assert.equal((await get(lan.url, '/graph.json?token=wrong', lanHost)).status, 401)
    const entry = await get(lan.url, '/?token=secret-token-123', lanHost)
    assert.equal(entry.status, 302)
    assert.equal(entry.headers.location, '/')
    const cookie = String(entry.headers['set-cookie']).split(';')[0]
    assert.match(String(entry.headers['set-cookie']), /HttpOnly; SameSite=Strict/)
    assert.equal((await get(lan.url, '/graph.json', { ...lanHost, Cookie: cookie })).status, 200)
    // This machine needs no token.
    assert.equal((await get(lan.url, '/graph.json')).status, 200)
    assert.ok(JSON.parse(readFileSync(join(sandbox, 'graph.json'), 'utf8')).board)
  })
})
