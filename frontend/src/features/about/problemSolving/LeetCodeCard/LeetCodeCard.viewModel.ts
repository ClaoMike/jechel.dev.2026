import { useState } from 'react'
import { failureOf } from '../../../../services/api'
import { useGetLeetCodeQuery } from '../../../../store/api/aboutApi'
import { DIFFICULTIES, DIFFICULTY_LABELS, leetCodeProfileUrl, STALE_AFTER_MS } from '../problemSolving'

const count = (n: number) => n.toLocaleString('en-GB')

/**
 * The stats from the store, by username (a new one loads afresh): LeetCode may not know the user
 * (404: the admin is told, visitors see nothing), or not answer (then a retry).
 */
export function useLeetCodeCardViewModel({ username, canEdit }: { username: string; canEdit: boolean }) {
  const query = useGetLeetCodeQuery(username)
  // When the card first showed: "stale" is judged against it.
  const [now] = useState(Date.now)
  const { currentData: stats, error, isError, isFetching } = query
  const profile = { href: leetCodeProfileUrl(username), username: stats?.username ?? username }

  const loading = isFetching && (isError || stats === undefined)
  const status = loading ? 'loading' : isError ? (failureOf(error).status === 404 ? 'not-found' : 'unavailable') : stats === undefined ? 'loading' : stats ? 'loaded' : 'unavailable'

  return {
    status: status === 'not-found' && !canEdit ? ('hidden' as const) : status,
    profile,
    notFound: `LeetCode has no user called ${username}. Check the username with Edit.`,
    unavailable: "LeetCode stats can't be loaded right now.",
    retry: () => void query.refetch(),
    solved: stats ? stats.solved : null,
    difficulties: stats
      ? DIFFICULTIES.map((difficulty) => {
          const solved = stats.solved[difficulty]
          const total = stats.total[difficulty]
          return { key: difficulty, label: DIFFICULTY_LABELS[difficulty], solved: count(solved), total: count(total), percent: total ? Math.min(100, (solved / total) * 100) : 0 }
        })
      : [],
    // Stats older than two days: the API couldn't reach LeetCode since, so say when they're from.
    asOf:
      stats && now - new Date(stats.fetchedAt).getTime() > STALE_AFTER_MS
        ? `As of ${new Date(stats.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
        : null,
  }
}
