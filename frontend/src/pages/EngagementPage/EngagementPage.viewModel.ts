import { useState } from 'react'
import type { AnalyticsRange } from '../../services/api'
import { useAppDispatch } from '../../store'
import { useGetSummaryQuery } from '../../store/api/analyticsApi'
import { baseApi } from '../../store/baseApi'
import { toLoadable } from '../../store/loadable'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
  { value: '5y', label: '5 years' },
  { value: 'all', label: 'All time' },
]

/** The period picked, its numbers, and Refresh (the numbers and the visits load again). */
export function useDashboardViewModel() {
  const dispatch = useAppDispatch()
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const query = useGetSummaryQuery(range)

  return {
    ranges: RANGES.map((r) => ({ ...r, pressed: range === r.value, choose: () => setRange(r.value) })),
    state: toLoadable(query),
    refresh: () => dispatch(baseApi.util.invalidateTags(['Summary', 'Visits'])),
    retry: () => void query.refetch(),
  }
}
