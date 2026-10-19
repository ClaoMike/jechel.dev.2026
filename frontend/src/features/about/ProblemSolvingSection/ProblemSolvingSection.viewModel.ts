import { useState } from 'react'
import { failureOf, type LeetCodeStats } from '../../../services/api'
import { useGetLeetCodeQuery } from '../../../store/api/aboutApi'
import { STALE_AFTER_MS } from '../problemSolving'

export type LeetCodeLoad = { status: 'loading' } | { status: 'loaded'; stats: LeetCodeStats; stale: boolean } | { status: 'not-found' } | { status: 'unavailable' }

/** The stats from the store, by username (a new one loads afresh): LeetCode may not know the user (404), or not answer. */
export function useLeetCodeCardViewModel(username: string) {
  const query = useGetLeetCodeQuery(username)
  // When the card first showed: "stale" is judged against it.
  const [now] = useState(Date.now)
  const { currentData: stats, error, isError, isFetching } = query

  let load: LeetCodeLoad
  if (isFetching && (isError || stats === undefined)) load = { status: 'loading' }
  else if (isError) load = { status: failureOf(error).status === 404 ? 'not-found' : 'unavailable' }
  else if (stats === undefined) load = { status: 'loading' }
  else load = stats ? { status: 'loaded', stats, stale: now - new Date(stats.fetchedAt).getTime() > STALE_AFTER_MS } : { status: 'unavailable' }

  return { load, shownUsername: load.status === 'loaded' ? load.stats.username : username, retry: () => void query.refetch() }
}
