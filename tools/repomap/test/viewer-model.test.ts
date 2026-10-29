/**
 * The viewer's pure logic (the graph index, search) on a small hand-written graph.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GraphEdge, GraphNode, RepoGraph } from '../src/shared/types.ts'
import { indexGraph } from '../viewer/src/model/graph.ts'
import { search } from '../viewer/src/model/search.ts'

const n = (id: string, kind: string, layer: string, role = 'production', parent?: string): GraphNode => ({
  id,
  label: id.split(':').pop()!,
  kind,
  layer,
  role,
  parent,
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
      { id: 'page', label: 'Page', color: '#38bdf8' },
      { id: 'api-call', label: 'API call', color: '#2dd4bf' },
      { id: 'endpoint', label: 'Endpoint', color: '#4ade80' },
      { id: 'service', label: 'Service', color: '#34d399' },
      { id: 'table', label: 'Table', color: '#fb923c' },
      { id: 'column', label: 'Column', color: '#fdba74' },
      { id: 'test-suite', label: 'Test suite', color: '#fb7185' },
    ],
    edgeTypes: [
      { id: 'contains', label: 'Contains', color: '#64748b' },
      { id: 'calls', label: 'Calls', color: '#22d3ee' },
      { id: 'http', label: 'HTTP', color: '#2dd4bf' },
      { id: 'injects', label: 'Injects', color: '#34d399' },
      { id: 'queries', label: 'Queries', color: '#fbbf24' },
      { id: 'foreign-key', label: 'FK', color: '#fdba74' },
      { id: 'tests', label: 'Tests', color: '#fb7185' },
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

describe('graph index', () => {
  it('links parents and children, and counts connections without containment', () => {
    const table = index.byId.get('t:books')!
    assert.deepEqual(index.children[table].map((i) => index.nodes[i].id), ['col:books.author_id'])
    assert.equal(index.nodes[index.parent[index.byId.get('col:authors.id')!]].id, 't:authors')
    assert.equal(index.degree[index.byId.get('s:Catalog')!], 4)
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
