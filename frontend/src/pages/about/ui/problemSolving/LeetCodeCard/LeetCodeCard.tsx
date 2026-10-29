import { useState } from 'react'
import { ErrorState } from '@/shared/ui/ErrorState'
import { failureOf } from '@/shared/api'
import { useGetLeetCodeQuery } from '../../../api/aboutApi'
import { DifficultyBreakdown } from '../DifficultyBreakdown/DifficultyBreakdown'
import { LeetCodeProfileLink } from '../LeetCodeProfileLink/LeetCodeProfileLink'
import { LeetCodeSkeleton } from '../LeetCodeSkeleton/LeetCodeSkeleton'
import { DIFFICULTIES, DIFFICULTY_LABELS, leetCodeProfileUrl, STALE_AFTER_MS } from '../../../lib/problemSolving'
import { SolvedRing } from '../SolvedRing/SolvedRing'
import { strings } from '@/shared/i18n'

const count = (n: number) => n.toLocaleString('en-GB')

/**
 * The LeetCode stats: solved overall (a ring) and by difficulty. Keyed by username, so a new one starts afresh.
 * LeetCode may not know the user (404: the admin is told, visitors see nothing), or not answer (then a retry).
 */
export function LeetCodeCard({ username, canEdit }: { username: string; canEdit: boolean }) {
  const query = useGetLeetCodeQuery(username)
  // When the card first showed: "stale" is judged against it.
  const [now] = useState(Date.now)
  const { currentData: stats, error, isError, isFetching } = query

  const loading = isFetching && (isError || stats === undefined)
  const status = loading
    ? 'loading'
    : isError
      ? failureOf(error).status === 404
        ? 'not-found'
        : 'unavailable'
      : stats === undefined
        ? 'loading'
        : stats
          ? 'loaded'
          : 'unavailable'

  if (status === 'not-found')
    return canEdit ? (
      <p className="field-error">
        {strings.leetCodeCard.leetcodeHasNoUser}
        {username}
        {strings.leetCodeCard.checkUsernameEdit}
      </p>
    ) : null
  return (
    <div className="leetcode">
      <LeetCodeProfileLink href={leetCodeProfileUrl(username)} username={stats?.username ?? username} />
      {status === 'loading' && <LeetCodeSkeleton />}
      {status === 'unavailable' && <ErrorState compact message={strings.leetCodeCard.leetcodeStatsCantLoaded} onRetry={() => void query.refetch()} />}
      {status === 'loaded' && stats && (
        <>
          <div className="leetcode-body">
            <SolvedRing solved={stats.solved} />
            <DifficultyBreakdown
              rows={DIFFICULTIES.map((difficulty) => {
                const solved = stats.solved[difficulty]
                const total = stats.total[difficulty]
                return {
                  key: difficulty,
                  label: DIFFICULTY_LABELS[difficulty],
                  solved: count(solved),
                  total: count(total),
                  percent: total ? Math.min(100, (solved / total) * 100) : 0,
                }
              })}
            />
          </div>
          {/* Stats older than two days: the API couldn't reach LeetCode since, so say when they're from. */}
          {now - new Date(stats.fetchedAt).getTime() > STALE_AFTER_MS && (
            <p className="muted leetcode-stale">
              {strings.leetCodeCard.asOf}
              {new Date(stats.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
            </p>
          )}
        </>
      )}
    </div>
  )
}
