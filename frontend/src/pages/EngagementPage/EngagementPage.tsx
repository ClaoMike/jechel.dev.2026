import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonList } from '../../components/Skeleton'
import { RankedList } from '../../features/analytics/RankedList'
import { SeriesChart } from '../../features/analytics/SeriesChart/SeriesChart'
import { StatTiles } from '../../features/analytics/StatTiles'
import { VisitsTable } from '../../features/analytics/VisitsTable/VisitsTable'
import { useDashboardViewModel } from './EngagementPage.viewModel'

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
  const vm = useDashboardViewModel()
  const { state } = vm

  return (
    <div className="engagement">
      <div className="engagement-header">
        <h2 id="engagement-title">Engagement</h2>
        <div className="engagement-toggle" role="group" aria-label="Period">
          {vm.ranges.map((range) => (
            <button key={range.value} type="button" className="licence-toggle" aria-pressed={range.pressed} onClick={range.choose}>
              {range.label}
            </button>
          ))}
          <button type="button" className="button button-secondary button-small" onClick={vm.refresh}>
            Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <Loading label="Loading the numbers…">
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
      {state.status === 'error' && (
        <ErrorState message="The numbers couldn't be loaded." onRetry={vm.retry} />
      )}
      {state.status === 'loaded' && (
        <>
          <StatTiles totals={state.data.totals} />
          <SeriesChart series={state.data.series} bucketSize={state.data.bucketSize} />
          <div className="ranked-grid">
            <RankedList title="Top pages" items={state.data.topPages} />
            <RankedList title="Where visitors come from" items={state.data.referrers} />
            <RankedList title="Most clicked" items={state.data.topClicks} />
            <RankedList title="Errors" items={state.data.topErrors} empty="No errors. 🎉" />
            <RankedList title="Preferred theme" items={state.data.themes} />
            <RankedList title="Theme switches" items={state.data.themeSwitches} empty="Nobody has switched yet." />
            <RankedList title="Devices" items={state.data.devices} />
            <RankedList title="Browsers" items={state.data.browsers} />
            <RankedList title="Time zones" items={state.data.timeZones} />
          </div>
          <p className="muted engagement-note">
            Preferred theme is the one a visit ended in (first-time visitors start in Vice). Days, months and years are UTC; minutes and hours are shown in your time zone. Visitors are counted once a day without cookies, so the same person on two days counts twice. Your own visits while
            signed in aren't recorded.
          </p>
        </>
      )}

      <VisitsTable />
    </div>
  )
}
