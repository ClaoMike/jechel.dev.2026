import type { LeetCodeStats } from '../../../../services/api'
import { RING_RADIUS, useSolvedRingViewModel } from './SolvedRing.viewModel'

/** The total solved, in a ring split by difficulty like LeetCode's own. */
export function SolvedRing({ solved }: { solved: LeetCodeStats['solved'] }) {
  const vm = useSolvedRingViewModel(solved)
  return (
    <div className="leetcode-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="leetcode-ring-track" cx="60" cy="60" r={RING_RADIUS} />
        {vm.arcs.map((arc) => (
          <circle key={arc.key} className={`leetcode-ring-segment leetcode-${arc.key}`} cx="60" cy="60" r={RING_RADIUS} strokeDasharray={arc.dashArray} strokeDashoffset={arc.dashOffset} />
        ))}
      </svg>
      <p className="leetcode-ring-label">
        <strong>{vm.total}</strong>
        <span>solved</span>
      </p>
    </div>
  )
}
