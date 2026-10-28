import { useState } from 'react'
import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonList } from '../../components/Skeleton'
import { RankedList } from '../../features/analytics/RankedList'
import { SeriesChart } from '../../features/analytics/SeriesChart/SeriesChart'
import { StatTiles } from '../../features/analytics/StatTiles'
import { VisitsTable } from '../../features/analytics/VisitsTable/VisitsTable'
import type { AnalyticsRange } from '../../services/api'
import { useAppDispatch } from '../../store'
import { countryName } from '../../features/analytics/format'
import { useGetSummaryQuery } from '../../store/api/analyticsApi'
import { baseApi } from '../../store/baseApi'
import { toLoadable } from '../../store/loadable'
import { strings } from '../../strings'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '1h', label: strings.engagementPage.n1Hour },
  { value: '24h', label: strings.engagementPage.n1Day },
  { value: '7d', label: strings.engagementPage.n7Days },
  { value: '30d', label: strings.engagementPage.n30Days },
  { value: '90d', label: strings.engagementPage.n90Days },
  { value: '1y', label: strings.engagementPage.n1Year },
  { value: '5y', label: strings.engagementPage.n5Years },
  { value: 'all', label: strings.engagementPage.allTime },
]

/**
 * How visitors use the site (an admin-only tab): headline numbers for a period (an hour to all time), a chart, where visitors
 * come from and what they click, and every visit, replayable step by step to reproduce errors.
 * Recorded by features/analytics; the admin's own browsing isn't. Visitors who open the URL go home.
 */
export function EngagementPage() {
  return (
    <AdminOnly>
      <Dashboard />
    </AdminOnly>
  )
}

function Dashboard() {
  // The period picked, its numbers (countries by name), and Refresh (the numbers, the visits and an open visit load
  // again).
  const dispatch = useAppDispatch()
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const query = useGetSummaryQuery(range)
  const ranges = RANGES.map((r) => ({ ...r, pressed: range === r.value, choose: () => setRange(r.value) }))
  const state = toLoadable(query)
  const countries = (query.data?.countries ?? []).map((c) => ({ name: countryName(c.name), count: c.count }))
  const refresh = () => dispatch(baseApi.util.invalidateTags([strings.engagementPage.summary, strings.common.visits, strings.engagementPage.visit]))
  const retry = () => void query.refetch()

  return (
    <div className="engagement">
      <div className="engagement-header">
        <h2 id="engagement-title">{strings.engagementPage.engagement}</h2>
        <div className="engagement-toggle" role="group" aria-label={strings.engagementPage.period}>
          {ranges.map((range) => (
            <button key={range.value} type="button" className="licence-toggle" aria-pressed={range.pressed} onClick={range.choose}>
              {range.label}
            </button>
          ))}
          <button type="button" className="button button-secondary button-small" onClick={refresh}>
            {strings.engagementPage.refresh}
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <Loading label={strings.engagementPage.loadingNumbers}>
          <div className="skeleton-tiles">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton-tile">
                <Skeleton width="55%" height={12} />
                <Skeleton width="40%" height={26} />
              </div>
            ))}
          </div>
          <div className="card skeleton-chart">
            {Array.from({ length: 24 }, (_, i) => (
              <Skeleton key={i} height={`${25 + ((i * 37) % 70)}%`} radius={4} />
            ))}
          </div>
          <div className="ranked-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card skeleton-card">
                <Skeleton width="45%" height={18} />
                <SkeletonList rows={4} />
              </div>
            ))}
          </div>
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message={strings.engagementPage.numbersCouldntLoaded} onRetry={retry} />}
      {state.status === 'loaded' && (
        <>
          <StatTiles totals={state.data.totals} />
          <SeriesChart series={state.data.series} bucketSize={state.data.bucketSize} />
          <div className="ranked-grid">
            <RankedList title={strings.engagementPage.topPages} items={state.data.topPages} />
            <RankedList title={strings.engagementPage.whereVisitorsCome} items={state.data.referrers} />
            <RankedList title={strings.engagementPage.mostClicked} items={state.data.topClicks} />
            <RankedList title={strings.engagementPage.whatVisitorsDid} items={state.data.siteEvents} empty={strings.engagementPage.nothingReportedYet} />
            <RankedList title={strings.common.errors} items={state.data.topErrors} empty={strings.engagementPage.noErrors} />
            <RankedList title={strings.engagementPage.preferredTheme} items={state.data.themes} />
            <RankedList title={strings.engagementPage.themeSwitches} items={state.data.themeSwitches} empty={strings.engagementPage.nobodyHasSwitchedYet} />
            <RankedList title={strings.engagementPage.devices} items={state.data.devices} />
            <RankedList title={strings.engagementPage.browsers} items={state.data.browsers} />
            <RankedList title={strings.engagementPage.countries} items={countries} />
            <RankedList title={strings.engagementPage.timeZones} items={state.data.timeZones} />
          </div>
        </>
      )}

      <VisitsTable />
    </div>
  )
}
