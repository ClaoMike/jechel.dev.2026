import { useEffect, useRef, useState } from 'react'
import type { BucketSize, SeriesPoint } from '../../../services/api'
import { axisScale, BUCKET_NAMES, formatBucket, formatCount } from '../format'
import { strings } from '../../../strings'

const METRICS = [
  { key: 'visitors', label: strings.seriesChart.visitors, one: 'visitor', many: 'visitors' },
  { key: 'pageViews', label: strings.seriesChart.pageViews, one: strings.seriesChart.pageView, many: strings.seriesChart.pageViews2 },
  { key: 'errors', label: strings.common.errors, one: 'error', many: 'errors' },
] as const

type Metric = (typeof METRICS)[number]['key']

const HEIGHT = 200
const PAD = { top: 12, right: 8, bottom: 26, left: 36 }
const MAX_BAR = 24
/** The surface gap between neighbouring bars. */
const GAP = 2
const MAX_X_LABELS = 7

/** A rounded top (4px) on a bar that stays square at the baseline. */
function roundedTop(x: number, y: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

/** The element's width in CSS pixels, kept up to date (640 where ResizeObserver doesn't exist). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * One measure per column (5 minutes to a year, as the period asks) as columns, picked with the buttons above (one series at a time: they don't
 * share a scale). Drawn at the container's real width so the text stays readable on a phone; hover
 * or tap a day for its number. A hidden table gives screen readers the same numbers.
 */
export function SeriesChart({ series, bucketSize }: { series: SeriesPoint[]; bucketSize: BucketSize }) {
  // The chart laid out at the container's real width: the measure picked, its grid lines, bars, labels and the hovered
  // column.
  const [metric, setMetric] = useState<Metric>('visitors')
  const [hovered, setHovered] = useState<number | null>(null)
  const [wrapper, width] = useWidth<HTMLDivElement>()
  const info = METRICS.find((m) => m.key === metric)!

  const values = series.map((point) => point[metric])
  const { max, ticks: tickValues } = axisScale(Math.max(0, ...values))
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const band = Math.max(1, width - PAD.left - PAD.right) / Math.max(1, series.length)
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - GAP))
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight
  const labelEvery = Math.ceil(series.length / MAX_X_LABELS)
  const per = BUCKET_NAMES[bucketSize]
  const total = values.reduce((sum, value) => sum + value, 0)
  const hoveredPoint = hovered !== null ? series[hovered] : undefined
  const title = strings.seriesChart.per(info.label, per)
  const summary = strings.seriesChart.perTotal(info.label, per, total)
  const metricLabel = info.label
  const metrics = METRICS.map((m) => ({ key: m.key, label: m.label, pressed: metric === m.key, choose: () => setMetric(m.key) }))
  const ticks = tickValues.map((tick) => ({ value: tick, y: y(tick), label: formatCount(tick) }))
  const columns = series.map((point, i) => {
    const center = PAD.left + band * i + band / 2
    const top = y(values[i])
    return {
      key: point.start,
      left: center - band / 2,
      band,
      center,
      hovered: hovered === i,
      bar: values[i] > 0 ? { className: `chart-bar chart-bar-${metric}`, path: roundedTop(center - barWidth / 2, top, barWidth, PAD.top + plotHeight - top) } : null,
      axisLabel: (series.length - 1 - i) % labelEvery === 0 ? formatBucket(point.start, bucketSize, 'axis', series.length <= 7) : null,
      hover: () => setHovered(i),
      fullLabel: formatBucket(point.start, bucketSize, 'full'),
      value: values[i],
    }
  })
  const tooltip =
    hovered !== null && hoveredPoint
      ? {
          style: { left: Math.min(Math.max(PAD.left + band * hovered + band / 2, 70), width - 70), top: Math.max(y(values[hovered]) - 8, 0) },
          title: formatBucket(hoveredPoint.start, bucketSize, 'full'),
          text: `${values[hovered]} ${values[hovered] === 1 ? info.one : info.many}`,
        }
      : null
  const leave = () => setHovered(null)

  return (
    <section className="card engagement-chart" aria-labelledby="engagement-chart-title">
      <div className="engagement-card-header">
        <h3 id="engagement-chart-title">{title}</h3>
        <div className="engagement-toggle" role="group" aria-label={strings.seriesChart.measure}>
          {metrics.map((m) => (
            <button key={m.key} type="button" className="licence-toggle" aria-pressed={m.pressed} onClick={m.choose}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapper} className="chart-frame" onPointerLeave={leave}>
        <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={tick.y} y2={tick.y} />
              <text className="chart-axis" x={PAD.left - 8} y={tick.y} dy="0.32em" textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}

          {columns.map((column) => (
            <g key={column.key}>
              {column.hovered && <rect className="chart-hover-band" x={column.left} y={PAD.top} width={column.band} height={plotHeight} />}
              {column.bar && <path className={column.bar.className} d={column.bar.path} />}
              {column.axisLabel !== null && (
                <text className="chart-axis" x={column.center} y={HEIGHT - 8} textAnchor="middle">
                  {column.axisLabel}
                </text>
              )}
              {/* The whole day's column is the hover/tap target, not just the bar. */}
              <rect className="chart-hit" x={column.left} y={PAD.top} width={column.band} height={plotHeight} onPointerEnter={column.hover} onPointerDown={column.hover} />
            </g>
          ))}
        </svg>

        {tooltip && (
          <div className="chart-tooltip" style={tooltip.style} role="status">
            <strong>{tooltip.title}</strong>
            <span>{tooltip.text}</span>
          </div>
        )}
      </div>

      {/* The numbers for screen readers. Hidden around the table, not on it: a table's caption sits outside the table's own
          box, so hiding the table left "Visitors per day" showing under the chart. */}
      <div className="visually-hidden">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{strings.common.from}</th>
              <th scope="col">{metricLabel}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
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
