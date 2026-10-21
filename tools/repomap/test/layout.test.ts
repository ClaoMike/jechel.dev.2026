import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeLayout, layerHeights, treeParents, type LayoutEdge, type LayoutNode } from '../src/shared/layout.ts'

const layers = ['frontend', 'backend', 'database']
const options = { layers, roleOffsets: { production: 0, test: 14 }, roleParents: { 'test/unit': 'test' }, layerGap: 90, seed: 3 }

function sampleGraph(extra = 0): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const nodes: LayoutNode[] = [
    { id: 'page', layer: 'frontend', role: 'production', tags: ['feature:books'] },
    { id: 'call', layer: 'frontend', role: 'production', tags: ['feature:books'] },
    { id: 'endpoint', layer: 'backend', role: 'production', tags: ['feature:books'] },
    { id: 'service', layer: 'backend', role: 'production' },
    { id: 'table', layer: 'database', role: 'production' },
    { id: 'column', layer: 'database', role: 'production', parent: 'table' },
    { id: 'test', layer: 'backend', role: 'test/unit' },
  ]
  for (let i = 0; i < extra; i++) nodes.push({ id: `extra${i}`, layer: 'frontend', role: 'production' })
  const edges: LayoutEdge[] = [
    { from: 'page', to: 'call', type: 'calls' },
    { from: 'call', to: 'endpoint', type: 'http' },
    { from: 'endpoint', to: 'service', type: 'injects' },
    { from: 'service', to: 'table', type: 'queries' },
    { from: 'test', to: 'service', type: 'tests' },
  ]
  return { nodes, edges }
}

describe('layout', () => {
  it('puts each layer on its own plane and roles on sub-planes below it', () => {
    const { nodes, edges } = sampleGraph()
    const positions = computeLayout(nodes, edges, options)
    const heights = layerHeights(layers, 90)
    assert.equal(positions.get('page')![1], heights.get('frontend'))
    assert.equal(positions.get('endpoint')![1], heights.get('backend'))
    assert.equal(positions.get('table')![1], heights.get('database'))
    // test/unit inherits the 14-unit offset of its parent role "test"
    assert.equal(positions.get('test')![1], heights.get('backend')! - 14)
  })

  it('is deterministic', () => {
    const { nodes, edges } = sampleGraph(12)
    const a = computeLayout(nodes, edges, options)
    const b = computeLayout([...nodes].reverse(), [...edges].reverse(), options)
    for (const [id, position] of a) assert.deepEqual(b.get(id), position)
  })

  it('keeps existing nodes nearly still when the graph grows (warm start)', () => {
    const first = computeLayout(sampleGraph(12).nodes, sampleGraph(12).edges, options)
    const grown = sampleGraph(13)
    const second = computeLayout(grown.nodes, grown.edges, { ...options, previous: first })
    let maxShift = 0
    for (const [id, [x, , z]] of first) {
      const [x2, , z2] = second.get(id)!
      maxShift = Math.max(maxShift, Math.hypot(x2 - x, z2 - z))
    }
    assert.ok(maxShift < 6, `existing nodes moved up to ${maxShift.toFixed(2)} units`)
  })

  it('pulls connected nodes of different layers towards the same x/z', () => {
    const { nodes, edges } = sampleGraph(20)
    const p = computeLayout(nodes, edges, options)
    const distance = (a: string, b: string) => Math.hypot(p.get(a)![0] - p.get(b)![0], p.get(a)![2] - p.get(b)![2])
    const unrelated = Math.max(...Array.from({ length: 20 }, (_, i) => distance('endpoint', `extra${i}`)))
    assert.ok(distance('call', 'endpoint') < unrelated, 'a client call sits closer (in x/z) to its endpoint than unrelated nodes')
  })

  it('spaces layers by their own gap when they have one', () => {
    const heights = layerHeights(['views', 'viewmodels', 'model', 'backend'], 90, { viewmodels: 40, model: 40 })
    assert.equal(heights.get('views')! - heights.get('viewmodels')!, 40)
    assert.equal(heights.get('viewmodels')! - heights.get('model')!, 40)
    assert.equal(heights.get('model')! - heights.get('backend')!, 90)
    assert.equal(heights.get('views')! + heights.get('backend')!, 0, 'centred on 0')
  })

  describe('tree layers', () => {
    const treeOptions = { ...options, layers: ['views', 'viewmodels', 'model', 'backend'], treeLayers: ['views', 'viewmodels', 'model'], layerGaps: { viewmodels: 40, model: 40 } }
    const nodes: LayoutNode[] = [
      { id: 'main', layer: 'views', role: 'production', kind: 'entrypoint' },
      { id: 'App', layer: 'views', role: 'production' },
      { id: 'useAppViewModel', layer: 'viewmodels', role: 'production' },
      { id: 'Page', layer: 'views', role: 'production' },
      { id: 'usePageViewModel', layer: 'viewmodels', role: 'production' },
      { id: 'booksApi', layer: 'model', role: 'production' },
      { id: 'useBooksQuery', layer: 'model', role: 'production', parent: 'booksApi' },
      { id: 'api', layer: 'model', role: 'production' },
      { id: 'api.books.list', layer: 'model', role: 'production', parent: 'api' },
      { id: 'Book', layer: 'model', role: 'production' },
      { id: 'vite.config.ts', layer: 'model', role: 'config' },
      { id: 'endpoint', layer: 'backend', role: 'production' },
    ]
    const edges: LayoutEdge[] = [
      { from: 'main', to: 'App', type: 'renders' },
      { from: 'App', to: 'useAppViewModel', type: 'uses' },
      { from: 'App', to: 'Page', type: 'renders' },
      { from: 'Page', to: 'usePageViewModel', type: 'uses' },
      { from: 'usePageViewModel', to: 'useBooksQuery', type: 'uses' },
      { from: 'useBooksQuery', to: 'api.books.list', type: 'calls' },
      { from: 'useBooksQuery', to: 'Book', type: 'uses-type' },
      { from: 'api.books.list', to: 'endpoint', type: 'http' },
    ]
    const p = computeLayout(nodes, edges, treeOptions)
    const r = (id: string) => Math.hypot(p.get(id)![0], p.get(id)![2])

    it('grows one tree from the entry point across the tree layers, one ring per step', () => {
      assert.deepEqual([p.get('main')![0], p.get('main')![2]], [0, 0])
      const chain = ['main', 'App', 'Page', 'usePageViewModel', 'booksApi', 'useBooksQuery', 'api', 'api.books.list']
      for (let i = 1; i < chain.length; i++) assert.ok(r(chain[i]) > r(chain[i - 1]), `${chain[i]} is further out than ${chain[i - 1]}`)
      assert.ok(r('Book') > r('useBooksQuery'), 'a type is reached through uses-type')
      assert.ok(r('vite.config.ts') >= r('api.books.list'), 'what the tree cannot reach goes on an outer ring')
    })

    it('keeps each node on its own layer plane', () => {
      const heights = layerHeights(treeOptions.layers, 90, treeOptions.layerGaps)
      assert.equal(p.get('App')![1], heights.get('views'))
      assert.equal(p.get('usePageViewModel')![1], heights.get('viewmodels'))
      assert.equal(p.get('useBooksQuery')![1], heights.get('model'))
    })

    it('hangs contained nodes under their container and reports the tree', () => {
      const tree = treeParents(nodes.filter((n) => n.layer !== 'backend'), edges, treeOptions.layers)
      assert.equal(tree.get('booksApi'), 'usePageViewModel', 'reached through its hook')
      assert.equal(tree.get('useBooksQuery'), 'booksApi')
      assert.equal(tree.get('api.books.list'), 'api')
      assert.equal(tree.get('main'), undefined)
    })

    it('is deterministic and leaves other layers to the simulation', () => {
      const again = computeLayout([...nodes].reverse(), [...edges].reverse(), treeOptions)
      for (const [id, position] of p) assert.deepEqual(again.get(id), position)
      const endpoint = p.get('endpoint')!
      assert.ok(Math.hypot(endpoint[0] - p.get('api.books.list')![0], endpoint[2] - p.get('api.books.list')![2]) < r('api.books.list'), 'an endpoint settles toward the call that reaches it')
    })
  })

  it('flat layers ignore role offsets', () => {
    const nodes: LayoutNode[] = [
      { id: 'ci', layer: 'infra', role: 'test' },
      { id: 'readme', layer: 'infra', role: 'production' },
    ]
    const p = computeLayout(nodes, [], { ...options, layers: ['infra'], flatLayers: ['infra'] })
    assert.equal(p.get('ci')![1], p.get('readme')![1])
  })
})
