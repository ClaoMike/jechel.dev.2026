/** Review mode's impact: what depends on changed chips, and the tests that cover them. Pure. */
import type { BoardIndex } from './model.ts'

/** Edge types that say nothing about one part depending on another. */
const NOT_DEPENDENCY = new Set(['contains', 'tests', 'mocks', 'migrates', 'navigates', 'registers', 'configures', 'depends-on'])

/**
 * Impact of changed nodes: the chips that depend on them, up to `depth` steps (callers, renderers, users
 * of their types), and the tests that cover a changed or affected chip. Works on chips (root nodes).
 */
export function computeImpact(bi: BoardIndex, touched: Set<number>, depth = 2): { impacted: Set<number>; tests: number[] } {
  const { index } = bi
  const dependents = new Map<number, Set<number>>()
  const testsOf = new Map<number, Set<number>>()
  index.edges.forEach((edge, e) => {
    const from = bi.rootOf[index.edgeFrom[e]]
    const to = bi.rootOf[index.edgeTo[e]]
    if (from === to) return
    if (edge.type === 'tests' || edge.type === 'mocks') {
      ;(testsOf.get(to) ?? testsOf.set(to, new Set()).get(to)!).add(from)
      return
    }
    if (NOT_DEPENDENCY.has(edge.type) || bi.hidden[from]) return
    ;(dependents.get(to) ?? dependents.set(to, new Set()).get(to)!).add(from)
  })
  const changed = new Set([...touched].map((i) => bi.rootOf[i]))
  const impacted = new Set<number>()
  let frontier = [...changed]
  for (let step = 0; step < depth && frontier.length > 0; step++) {
    const next: number[] = []
    for (const chip of frontier) {
      for (const dependent of dependents.get(chip) ?? []) {
        if (changed.has(dependent) || impacted.has(dependent)) continue
        impacted.add(dependent)
        next.push(dependent)
      }
    }
    frontier = next
  }
  const tests = new Set<number>()
  for (const chip of [...changed, ...impacted]) for (const test of testsOf.get(chip) ?? []) tests.add(test)
  // A changed test is a test to run, not a dependent.
  for (const chip of changed) if (bi.hidden[chip] && index.nodes[chip].role.startsWith('test')) tests.add(chip)
  return { impacted, tests: [...tests].sort((a, b) => index.nodes[a].label.localeCompare(index.nodes[b].label)) }
}
