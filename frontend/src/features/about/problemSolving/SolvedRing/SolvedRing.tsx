import type { LeetCodeStats } from '../../../../services/api'
import { DIFFICULTIES } from '../problemSolving'
import { strings } from '../../../../strings'

const RING_RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
/** Space between two difficulties' arcs. */
const GAP = 4

/** The total solved, in a ring split by difficulty like LeetCode's own. */
export function SolvedRing({ solved }: { solved: LeetCodeStats['solved'] }) {
  // One arc per difficulty that has any solved, each starting where the previous one ended.
  const lengths = DIFFICULTIES.map((difficulty) => ({ difficulty, length: solved.all ? (solved[difficulty] / solved.all) * CIRCUMFERENCE : 0 }))
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, arc) => sum + arc.length, 0))
  const arcs = lengths
    .map(({ difficulty, length }, i) => ({ key: difficulty, dashArray: `${Math.max(0, length - GAP)} ${CIRCUMFERENCE}`, dashOffset: -starts[i], length }))
    .filter((arc) => arc.length > 0)
  return (
    <div className="leetcode-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="leetcode-ring-track" cx="60" cy="60" r={RING_RADIUS} />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            className={`leetcode-ring-segment leetcode-${arc.key}`}
            cx="60"
            cy="60"
            r={RING_RADIUS}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
          />
        ))}
      </svg>
      <p className="leetcode-ring-label">
        <strong>{solved.all.toLocaleString('en-GB')}</strong>
        <span>{strings.solvedRing.solved}</span>
      </p>
    </div>
  )
}
