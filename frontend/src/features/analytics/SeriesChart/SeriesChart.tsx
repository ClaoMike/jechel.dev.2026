import type { BucketSize, SeriesPoint } from '../../../services/api'
import { HEIGHT, PAD, useSeriesChartViewModel } from './SeriesChart.viewModel'

/**
 * One measure per column (5 minutes to a year, as the period asks) as columns, picked with the buttons above (one series at a time: they don't
 * share a scale). Drawn at the container's real width so the text stays readable on a phone; hover
 * or tap a day for its number. A hidden table gives screen readers the same numbers.
 */
export function SeriesChart({ series, bucketSize }: { series: SeriesPoint[]; bucketSize: BucketSize }) {
  const { wrapperRef, ...vm } = useSeriesChartViewModel(series, bucketSize)

  return (
    <section className="card engagement-chart" aria-labelledby="engagement-chart-title">
      <div className="engagement-card-header">
        <h3 id="engagement-chart-title">{vm.title}</h3>
        <div className="engagement-toggle" role="group" aria-label="Measure">
          {vm.metrics.map((m) => (
            <button key={m.key} type="button" className="licence-toggle" aria-pressed={m.pressed} onClick={m.choose}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapperRef} className="chart-frame" onPointerLeave={vm.leave}>
        <svg width={vm.width} height={HEIGHT} role="img" aria-label={vm.summary}>
          {vm.ticks.map((tick) => (
            <g key={tick.value}>
              <line className="chart-grid" x1={PAD.left} x2={vm.width - PAD.right} y1={tick.y} y2={tick.y} />
              <text className="chart-axis" x={PAD.left - 8} y={tick.y} dy="0.32em" textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}

          {vm.columns.map((column) => (
            <g key={column.key}>
              {column.hovered && <rect className="chart-hover-band" x={column.left} y={PAD.top} width={column.band} height={vm.plotHeight} />}
              {column.bar && <path className={column.bar.className} d={column.bar.path} />}
              {column.axisLabel !== null && (
                <text className="chart-axis" x={column.center} y={HEIGHT - 8} textAnchor="middle">
                  {column.axisLabel}
                </text>
              )}
              {/* The whole day's column is the hover/tap target, not just the bar. */}
              <rect className="chart-hit" x={column.left} y={PAD.top} width={column.band} height={vm.plotHeight} onPointerEnter={column.hover} onPointerDown={column.hover} />
            </g>
          ))}
        </svg>

        {vm.tooltip && (
          <div className="chart-tooltip" style={vm.tooltip.style} role="status">
            <strong>{vm.tooltip.title}</strong>
            <span>{vm.tooltip.text}</span>
          </div>
        )}
      </div>

      {/* The numbers for screen readers. Hidden around the table, not on it: a table's caption sits outside the table's own
          box, so hiding the table left "Visitors per day" showing under the chart. */}
      <div className="visually-hidden">
        <table>
          <caption>{vm.title}</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">{vm.metricLabel}</th>
            </tr>
          </thead>
          <tbody>
            {vm.columns.map((column) => (
              <tr key={column.key}>
                <td>{column.fullLabel}</td>
                <td>{column.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
