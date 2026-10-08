import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeLayout, layerHeights, type LayoutEdge, type LayoutNode } from '../src/shared/layout.ts'

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

  it('flat layers ignore role offsets', () => {
    const nodes: LayoutNode[] = [
      { id: 'ci', layer: 'infra', role: 'test' },
      { id: 'readme', layer: 'infra', role: 'production' },
    ]
    const p = computeLayout(nodes, [], { ...options, layers: ['infra'], flatLayers: ['infra'] })
    assert.equal(p.get('ci')![1], p.get('readme')![1])
  })
})
