import type { AnalyticsSummary } from '../../services/api'
import { formatCount, formatDuration, formatPercent } from './format'

/** The headline numbers for the period. */
export function StatTiles({ totals }: { totals: AnalyticsSummary['totals'] }) {
  const tiles = [
    { label: 'Visitors', value: formatCount(totals.visitors), hint: 'Unique per day' },
    { label: 'Visits', value: formatCount(totals.sessions), hint: 'A tab, from opening to closing' },
    { label: 'Page views', value: formatCount(totals.pageViews), hint: totals.sessions ? `${(totals.pageViews / totals.sessions).toFixed(1)} per visit` : '' },
    { label: 'Average visit', value: formatDuration(totals.averageSessionSeconds), hint: 'First to last action' },
    { label: 'Bounce rate', value: formatPercent(totals.bounceRate), hint: 'One page, then gone' },
    { label: 'Errors', value: formatCount(totals.errors), hint: totals.errors ? 'See the visits below' : 'None' },
  ]
  return (
    <dl className="stat-tiles">
      {tiles.map((tile) => (
        <div key={tile.label} className={tile.label === 'Errors' && totals.errors > 0 ? 'card stat-tile stat-tile-alert' : 'card stat-tile'}>
          <dt>{tile.label}</dt>
          <dd>
            <span className="stat-value">{tile.value}</span>
            {tile.hint && <span className="stat-hint">{tile.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
