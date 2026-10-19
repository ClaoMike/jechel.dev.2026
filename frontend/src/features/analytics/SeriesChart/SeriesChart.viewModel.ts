import { useEffect, useRef, useState } from 'react'
import type { BucketSize, SeriesPoint } from '../../../services/api'
import { axisScale, BUCKET_NAMES, formatBucket, formatCount } from '../format'

const METRICS = [
  { key: 'visitors', label: 'Visitors', one: 'visitor', many: 'visitors' },
  { key: 'pageViews', label: 'Page views', one: 'page view', many: 'page views' },
  { key: 'errors', label: 'Errors', one: 'error', many: 'errors' },
] as const

type Metric = (typeof METRICS)[number]['key']

export const HEIGHT = 200
export const PAD = { top: 12, right: 8, bottom: 26, left: 36 }
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

/** The chart laid out at the container's real width: the measure picked, its grid lines, bars, labels and the hovered column. */
export function useSeriesChartViewModel(series: SeriesPoint[], bucketSize: BucketSize) {
  const [metric, setMetric] = useState<Metric>('visitors')
  const [hovered, setHovered] = useState<number | null>(null)
  const [wrapper, width] = useWidth<HTMLDivElement>()
  const info = METRICS.find((m) => m.key === metric)!

  const values = series.map((point) => point[metric])
  const { max, ticks } = axisScale(Math.max(0, ...values))
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const band = Math.max(1, width - PAD.left - PAD.right) / Math.max(1, series.length)
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - GAP))
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight
  const labelEvery = Math.ceil(series.length / MAX_X_LABELS)
  const per = BUCKET_NAMES[bucketSize]
  const total = values.reduce((sum, value) => sum + value, 0)
  const hoveredPoint = hovered !== null ? series[hovered] : undefined

  return {
    wrapperRef: wrapper,
    width,
    plotHeight,
    title: `${info.label} per ${per}`,
    summary: `${info.label} per ${per}: ${total} in total`,
    metricLabel: info.label,
    metrics: METRICS.map((m) => ({ key: m.key, label: m.label, pressed: metric === m.key, choose: () => setMetric(m.key) })),
    ticks: ticks.map((tick) => ({ value: tick, y: y(tick), label: formatCount(tick) })),
    columns: series.map((point, i) => {
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
    }),
    tooltip:
      hovered !== null && hoveredPoint
        ? {
            style: { left: Math.min(Math.max(PAD.left + band * hovered + band / 2, 70), width - 70), top: Math.max(y(values[hovered]) - 8, 0) },
            title: formatBucket(hoveredPoint.start, bucketSize, 'full'),
            text: `${values[hovered]} ${values[hovered] === 1 ? info.one : info.many}`,
          }
        : null,
    leave: () => setHovered(null),
  }
}
