import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import { RankedList } from '../features/analytics/RankedList'
import { SeriesChart } from '../features/analytics/SeriesChart'
import { StatTiles } from '../features/analytics/StatTiles'
import { VisitsTable } from '../features/analytics/VisitsTable'
import { api, type AnalyticsRange, type AnalyticsSummary } from '../services/api'

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

type State = { status: 'loading' } | { status: 'loaded'; summary: AnalyticsSummary } | { status: 'error' }

/**
 * How visitors use the site (an admin-only tab): headline numbers for a period (an hour to all time), a chart, where visitors
 * come from and what they click, and every visit, replayable step by step to reproduce errors.
 * Recorded by features/analytics; the admin's own browsing isn't. Visitors who open the URL go home.
 */
export function EngagementPage() {
  const { status } = useAuth()

  if (status === 'loading') return <p>Loading…</p>
  if (status === 'anonymous') return <Navigate to="/" replace />
  return <Dashboard />
}

function Dashboard() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [state, setState] = useState<State>({ status: 'loading' })
  // Bumped by Refresh and after a delete, to load everything again.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    api.analytics
      .summary(range, controller.signal)
      .then((summary) => setState({ status: 'loaded', summary }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [range, reloadKey])

  return (
    <div className="engagement">
      <div className="engagement-header">
        <h2 id="engagement-title">Engagement</h2>
        <div className="engagement-toggle" role="group" aria-label="Period">
          {RANGES.map(({ value, label }) => (
            <button key={value} type="button" className="licence-toggle" aria-pressed={range === value} onClick={() => setRange(value)}>
              {label}
            </button>
          ))}
          <button type="button" className="button button-secondary button-small" onClick={reload}>
            Refresh
          </button>
        </div>
      </div>

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">The numbers couldn't be loaded. Please try again later.</p>}
      {state.status === 'loaded' && (
        <>
          <StatTiles totals={state.summary.totals} />
          <SeriesChart series={state.summary.series} bucketSize={state.summary.bucketSize} />
          <div className="ranked-grid">
            <RankedList title="Top pages" items={state.summary.topPages} />
            <RankedList title="Where visitors come from" items={state.summary.referrers} />
            <RankedList title="Most clicked" items={state.summary.topClicks} />
            <RankedList title="Errors" items={state.summary.topErrors} empty="No errors. 🎉" />
            <RankedList title="Preferred theme" items={state.summary.themes} />
            <RankedList title="Theme switches" items={state.summary.themeSwitches} empty="Nobody has switched yet." />
            <RankedList title="Devices" items={state.summary.devices} />
            <RankedList title="Browsers" items={state.summary.browsers} />
            <RankedList title="Time zones" items={state.summary.timeZones} />
          </div>
          <p className="muted engagement-note">
            Preferred theme is the one a visit ended in (first-time visitors start in Vice). Days, months and years are UTC; minutes and hours are shown in your time zone. Visitors are counted once a day without cookies, so the same person on two days counts twice. Your own visits while
            signed in aren't recorded.
          </p>
        </>
      )}

      <VisitsTable reloadKey={reloadKey} onChange={reload} />
    </div>
  )
}
