import { ErrorState } from '../../../../components/ErrorState/ErrorState'
import { DifficultyBreakdown } from '../DifficultyBreakdown/DifficultyBreakdown'
import { LeetCodeProfileLink } from '../LeetCodeProfileLink/LeetCodeProfileLink'
import { LeetCodeSkeleton } from '../LeetCodeSkeleton/LeetCodeSkeleton'
import { SolvedRing } from '../SolvedRing/SolvedRing'
import { useLeetCodeCardViewModel } from './LeetCodeCard.viewModel'

/** The LeetCode stats: solved overall (a ring) and by difficulty. Keyed by username, so a new one starts afresh. */
export function LeetCodeCard(props: { username: string; canEdit: boolean }) {
  const vm = useLeetCodeCardViewModel(props)

  if (vm.status === 'hidden') return null
  if (vm.status === 'not-found') return <p className="field-error">{vm.notFound}</p>
  return (
    <div className="leetcode">
      <LeetCodeProfileLink href={vm.profile.href} username={vm.profile.username} />
      {vm.status === 'loading' && <LeetCodeSkeleton />}
      {vm.status === 'unavailable' && <ErrorState compact message={vm.unavailable} onRetry={vm.retry} />}
      {vm.status === 'loaded' && vm.solved && (
        <>
          <div className="leetcode-body">
            <SolvedRing solved={vm.solved} />
            <DifficultyBreakdown rows={vm.difficulties} />
          </div>
          {vm.asOf && <p className="muted leetcode-stale">{vm.asOf}</p>}
        </>
      )}
    </div>
  )
}
