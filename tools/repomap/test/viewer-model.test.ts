/**
 * The viewer's pure logic (filters, trace, search) on a small hand-written graph.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GraphEdge, GraphNode, RepoGraph } from '../src/shared/types.ts'
import { computeCounts, computeVisibility, everything, fromPreset, rollUpEdges, type FilterState } from '../viewer/src/model/filters.ts'
import { indexGraph } from '../viewer/src/model/graph.ts'
import { search } from '../viewer/src/model/search.ts'
import { computeTrace } from '../viewer/src/model/trace.ts'

const n = (id: string, kind: string, layer: string, role = 'production', parent?: string): GraphNode => ({
  id,
  label: id.split(':').pop()!,
  kind,
  layer,
  role,
  parent,
  pos: [0, 0, 0],
})
const e = (from: string, type: string, to: string): GraphEdge => ({ from, to, type, source: 'static', confidence: 1 })

const graph: RepoGraph = {
  version: 1,
  meta: {
    tool: { name: 'repomap', version: 'test' },
    repo: { name: 'sample' },
    generatedAt: '2026-01-01T00:00:00Z',
    layers: [
      { id: 'frontend', label: 'Frontend', color: '#38bdf8' },
      { id: 'backend', label: 'Backend', color: '#4ade80' },
      { id: 'database', label: 'Database', color: '#fb923c' },
    ],
    roles: [
      { id: 'production', label: 'Production', color: '#ffffff' },
      { id: 'test', label: 'Tests', color: '#fb7185' },
      { id: 'test/unit', label: 'Unit', color: '#fb7185', parent: 'test' },
    ],
    kinds: [
      { id: 'page', label: 'Page', color: '#38bdf8', shape: 'sphere' },
      { id: 'api-call', label: 'API call', color: '#2dd4bf', shape: 'cone' },
      { id: 'endpoint', label: 'Endpoint', color: '#4ade80', shape: 'octahedron' },
      { id: 'service', label: 'Service', color: '#34d399', shape: 'box' },
      { id: 'table', label: 'Table', color: '#fb923c', shape: 'cylinder' },
      { id: 'column', label: 'Column', color: '#fdba74', shape: 'sphere' },
      { id: 'test-suite', label: 'Test suite', color: '#fb7185', shape: 'torus' },
    ],
    edgeTypes: [
      { id: 'contains', label: 'Contains', color: '#64748b' },
      { id: 'calls', label: 'Calls', color: '#22d3ee', flow: true },
      { id: 'http', label: 'HTTP', color: '#2dd4bf', flow: true },
      { id: 'injects', label: 'Injects', color: '#34d399', flow: true },
      { id: 'queries', label: 'Queries', color: '#fbbf24', flow: true },
      { id: 'foreign-key', label: 'FK', color: '#fdba74', flow: true },
      { id: 'tests', label: 'Tests', color: '#fb7185', context: true },
    ],
    presets: [
      { id: 'everything', label: 'Everything', filter: {} },
      { id: 'architecture', label: 'Architecture', filter: { roles: { test: 'hide' } } },
      { id: 'data', label: 'Data', filter: { kinds: { '*': 'dim', table: 'show', column: 'show' } } },
    ],
  },
  nodes: [
    n('p:BooksPage', 'page', 'frontend'),
    n('p:AuthorsPage', 'page', 'frontend'),
    n('c:getBooks', 'api-call', 'frontend'),
    n('c:getAuthors', 'api-call', 'frontend'),
    n('e:GET /books', 'endpoint', 'backend'),
    n('e:GET /authors', 'endpoint', 'backend'),
    n('s:Catalog', 'service', 'backend'),
    n('t:books', 'table', 'database'),
    n('t:authors', 'table', 'database'),
    n('col:books.author_id', 'column', 'database', 'production', 't:books'),
    n('col:authors.id', 'column', 'database', 'production', 't:authors'),
    n('x:CatalogTests', 'test-suite', 'backend', 'test/unit'),
  ],
  edges: [
    e('p:BooksPage', 'calls', 'c:getBooks'),
    e('p:AuthorsPage', 'calls', 'c:getAuthors'),
    e('c:getBooks', 'http', 'e:GET /books'),
    e('c:getAuthors', 'http', 'e:GET /authors'),
    e('e:GET /books', 'injects', 's:Catalog'),
    e('e:GET /authors', 'injects', 's:Catalog'),
    e('s:Catalog', 'queries', 't:books'),
    e('t:books', 'contains', 'col:books.author_id'),
    e('t:authors', 'contains', 'col:authors.id'),
    e('col:books.author_id', 'foreign-key', 'col:authors.id'),
    e('x:CatalogTests', 'tests', 's:Catalog'),
  ],
  unresolved: [],
}

const index = indexGraph(graph)
const at = (id: string) => index.byId.get(id)!

describe('filters', () => {
  it('shows everything by default', () => {
    const v = computeVisibility(index, everything())
    assert.ok([...v.nodes].every((level) => level === 2))
    assert.ok([...v.edges].every((level) => level === 2))
  })

  it('hides a parent role and all its children, together with their edges', () => {
    const filters = fromPreset(graph.meta.presets[1].filter, index)
    const v = computeVisibility(index, filters)
    assert.equal(v.nodes[at('x:CatalogTests')], 0)
    const testsEdge = index.edges.findIndex((edge) => edge.type === 'tests')
    assert.equal(v.edges[testsEdge], 0)
    assert.equal(v.nodes[at('s:Catalog')], 2)
  })

  it('takes the most restrictive of layer, kind and role, and dims edges to dimmed nodes', () => {
    const filters: FilterState = { ...everything(), layers: { backend: 'dim' }, kinds: { 'backend/service': 'hide' } }
    const v = computeVisibility(index, filters)
    assert.equal(v.nodes[at('e:GET /books')], 1)
    assert.equal(v.nodes[at('s:Catalog')], 0)
    const http = index.edges.findIndex((edge) => edge.type === 'http' && edge.from === 'c:getBooks')
    assert.equal(v.edges[http], 1)
  })

  it('expands wildcard presets', () => {
    const filters = fromPreset(graph.meta.presets[2].filter, index)
    const v = computeVisibility(index, filters)
    assert.equal(v.nodes[at('t:books')], 2)
    assert.equal(v.nodes[at('p:BooksPage')], 1)
  })

  it('counts shown/total per facet', () => {
    const filters = fromPreset(graph.meta.presets[1].filter, index)
    const counts = computeCounts(index, computeVisibility(index, filters))
    assert.deepEqual(counts.roles.get('test'), { shown: 0, total: 1 })
    assert.deepEqual(counts.layers.get('backend'), { shown: 3, total: 4 })
  })

  it('rolls edges of hidden children up to their visible parents', () => {
    const filters: FilterState = { ...everything(), kinds: { 'database/column': 'hide' } }
    const rolled = rollUpEdges(index, filters, computeVisibility(index, filters))
    assert.deepEqual(rolled.map((r) => [index.nodes[r.from].id, r.type, index.nodes[r.to].id]), [['t:books', 'foreign-key', 't:authors']])
  })
})

describe('trace', () => {
  it('follows flow edges downstream and upstream without leaking into siblings', () => {
    const trace = computeTrace(index, at('p:BooksPage'), { includeTests: false })
    const ids = new Set([...trace.nodes.keys()].map((i) => index.nodes[i].id))
    for (const id of ['c:getBooks', 'e:GET /books', 's:Catalog', 't:books']) assert.ok(ids.has(id), `${id} is downstream`)
    // A table reached mid-trace is not expanded into all its columns (traces stay column-precise).
    assert.ok(!ids.has('col:authors.id'))
    // AuthorsPage also reaches Catalog, but only by going up from a shared dependency: not part of the slice.
    assert.ok(!ids.has('p:AuthorsPage'))
    assert.ok(!ids.has('e:GET /authors'))
  })

  it('shows upstream callers of a shared dependency', () => {
    const trace = computeTrace(index, at('s:Catalog'), { includeTests: false })
    const up = [...trace.nodes].filter(([, node]) => node.role === 'up').map(([i]) => index.nodes[i].id).sort()
    assert.deepEqual(up, ['c:getAuthors', 'c:getBooks', 'e:GET /authors', 'e:GET /books', 'p:AuthorsPage', 'p:BooksPage'])
  })

  it('adds tests as one-hop context only when asked', () => {
    const without = computeTrace(index, at('s:Catalog'), { includeTests: false })
    const withTests = computeTrace(index, at('s:Catalog'), { includeTests: true })
    assert.ok(!without.nodes.has(at('x:CatalogTests')))
    assert.equal(withTests.nodes.get(at('x:CatalogTests'))?.role, 'context')
  })

  it('traces a container through its children', () => {
    const trace = computeTrace(index, at('t:books'), { includeTests: false })
    assert.ok(trace.nodes.has(at('col:authors.id')), 'the FK of a child column is followed')
  })
})

describe('search', () => {
  it('ranks label matches first', () => {
    const hits = search(index, 'books')
    assert.equal(index.nodes[hits[0].i].id, 't:books')
    assert.ok(hits.some((h) => index.nodes[h.i].id === 'p:BooksPage'))
    assert.deepEqual(search(index, ''), [])
  })
})
