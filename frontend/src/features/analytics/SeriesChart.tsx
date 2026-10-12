import { useEffect, useRef, useState } from 'react'
import type { BucketSize, SeriesPoint } from '../../services/api'
import { axisScale, BUCKET_NAMES, formatBucket, formatCount } from './format'

const METRICS = [
  { key: 'visitors', label: 'Visitors', one: 'visitor', many: 'visitors' },
  { key: 'pageViews', label: 'Page views', one: 'page view', many: 'page views' },
  { key: 'errors', label: 'Errors', one: 'error', many: 'errors' },
] as const

type Metric = (typeof METRICS)[number]['key']

const HEIGHT = 200
const PAD = { top: 12, right: 8, bottom: 26, left: 36 }
const MAX_BAR = 24
/** The surface gap between neighbouring bars. */
const GAP = 2
const MAX_X_LABELS = 7

/**
 * One measure per column (5 minutes to a year, as the period asks) as columns, picked with the buttons above (one series at a time: they don't
 * share a scale). Drawn at the container's real width so the text stays readable on a phone; hover
 * or tap a day for its number. A hidden table gives screen readers the same numbers.
 */
export function SeriesChart({ series, bucketSize }: { series: SeriesPoint[]; bucketSize: BucketSize }) {
  const [metric, setMetric] = useState<Metric>('visitors')
  const [hovered, setHovered] = useState<number | null>(null)
  const [wrapper, width] = useWidth<HTMLDivElement>()
  const info = METRICS.find((m) => m.key === metric)!

  const values = series.map((point) => point[metric])
  const { max, ticks } = axisScale(Math.max(0, ...values))
  const plotWidth = Math.max(1, width - PAD.left - PAD.right)
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const band = plotWidth / Math.max(1, series.length)
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - GAP))
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight
  const labelEvery = Math.ceil(series.length / MAX_X_LABELS)
  const per = BUCKET_NAMES[bucketSize]
  const axisLabel = (start: string) => formatBucket(start, bucketSize, 'axis', series.length <= 7)
  const total = values.reduce((sum, value) => sum + value, 0)

  return (
    <section className="card engagement-chart" aria-labelledby="engagement-chart-title">
      <div className="engagement-card-header">
        <h3 id="engagement-chart-title">
          {info.label} per {per}
        </h3>
        <div className="engagement-toggle" role="group" aria-label="Measure">
          {METRICS.map((m) => (
            <button key={m.key} type="button" className="licence-toggle" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapper} className="chart-frame" onPointerLeave={() => setHovered(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label={`${info.label} per ${per}: ${total} in total`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
              <text className="chart-axis" x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatCount(tick)}
              </text>
            </g>
          ))}

          {series.map((point, i) => {
            const center = PAD.left + band * i + band / 2
            const value = values[i]
            const top = y(value)
            return (
              <g key={point.start}>
                {hovered === i && <rect className="chart-hover-band" x={center - band / 2} y={PAD.top} width={band} height={plotHeight} />}
                {value > 0 && <path className={`chart-bar chart-bar-${metric}`} d={roundedTop(center - barWidth / 2, top, barWidth, PAD.top + plotHeight - top)} />}
                {(series.length - 1 - i) % labelEvery === 0 && (
                  <text className="chart-axis" x={center} y={HEIGHT - 8} textAnchor="middle">
                    {axisLabel(point.start)}
                  </text>
                )}
                {/* The whole day's column is the hover/tap target, not just the bar. */}
                <rect
                  className="chart-hit"
                  x={center - band / 2}
                  y={PAD.top}
                  width={band}
                  height={plotHeight}
                  onPointerEnter={() => setHovered(i)}
                  onPointerDown={() => setHovered(i)}
                />
              </g>
            )
          })}
        </svg>

        {hovered !== null && series[hovered] && (
          <div
            className="chart-tooltip"
            style={{ left: Math.min(Math.max(PAD.left + band * hovered + band / 2, 70), width - 70), top: Math.max(y(values[hovered]) - 8, 0) }}
            role="status"
          >
            <strong>{formatBucket(series[hovered].start, bucketSize, 'full')}</strong>
            <span>
              {values[hovered]} {values[hovered] === 1 ? info.one : info.many}
            </span>
          </div>
        )}
      </div>

      <table className="visually-hidden">
        <caption>
          {info.label} per {per}
        </caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">{info.label}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point, i) => (
            <tr key={point.start}>
              <td>{formatBucket(point.start, bucketSize, 'full')}</td>
              <td>{values[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** A rounded top (4px) on a bar that stays square at the baseline. */
function roundedTop(x: number, y: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

/** The element's width in CSS pixels, kept up to date (640 where ResizeObserver doesn't exist, e.g. tests). */
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
