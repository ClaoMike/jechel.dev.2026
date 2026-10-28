import type { AnalyticsSummary } from '../../services/api'
import { formatCount, formatDuration, formatPercent } from './format'
import { strings } from '../../strings'

/** The headline numbers for the period. */
export function StatTiles({ totals }: { totals: AnalyticsSummary['totals'] }) {
  const tiles = [
    { label: strings.statTiles.visitors, value: formatCount(totals.visitors), hint: strings.statTiles.uniquePerDay },
    { label: strings.common.visits, value: formatCount(totals.sessions), hint: strings.statTiles.tabOpeningClosing },
    {
      label: strings.statTiles.pageViews,
      value: formatCount(totals.pageViews),
      hint: totals.sessions ? strings.statTiles.perVisit((totals.pageViews / totals.sessions).toFixed(1)) : '',
    },
    { label: strings.statTiles.averageVisit, value: formatDuration(totals.averageSessionSeconds), hint: strings.statTiles.firstLastAction },
    { label: strings.statTiles.bounceRate, value: formatPercent(totals.bounceRate), hint: strings.statTiles.onePageThenGone },
    { label: strings.common.errors, value: formatCount(totals.errors), hint: totals.errors ? strings.statTiles.seeVisitsBelow : strings.statTiles.none },
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
