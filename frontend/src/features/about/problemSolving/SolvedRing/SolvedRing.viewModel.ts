import type { LeetCodeStats } from '../../../../services/api'
import { DIFFICULTIES } from '../problemSolving'

export const RING_RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
/** Space between two difficulties' arcs. */
const GAP = 4

/** The ring's arcs, one per difficulty that has any solved, each starting where the previous one ended. */
export function useSolvedRingViewModel(solved: LeetCodeStats['solved']) {
  const lengths = DIFFICULTIES.map((difficulty) => ({ difficulty, length: solved.all ? (solved[difficulty] / solved.all) * CIRCUMFERENCE : 0 }))
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, arc) => sum + arc.length, 0))
  return {
    total: solved.all.toLocaleString('en-GB'),
    arcs: lengths
      .map(({ difficulty, length }, i) => ({ key: difficulty, dashArray: `${Math.max(0, length - GAP)} ${CIRCUMFERENCE}`, dashOffset: -starts[i], length }))
      .filter((arc) => arc.length > 0),
  }
}
