import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { AboutColors, Place } from '../../../../services/api'
import { trackEvent } from '../../../analytics'
import { VISIT_LABELS } from '../../legend'
import { plainText } from '../../textLinks'
import { placeLabel } from '../placeLabel'
import { MAP_HEIGHT, MAP_WIDTH, project } from '../projection'
import { WORLD_DOTS } from '../worldDots'

/** The visible part of the map, in map units. */
interface View {
  x: number
  y: number
  width: number
}

const FULL: View = { x: 0, y: 0, width: MAP_WIDTH }
export const MAX_ZOOM = 16
/** Pin radius on screen, in pixels at zoom 1; pins grow a little as the map zooms in. */
const PIN_RADIUS = 5

/** One line for screen readers: "Manchester, England, United Kingdom: Studied: BSc at Uni. Worked." */
function describe(place: Place): string {
  const visits = place.visits.map((v) => (v.note ? `${VISIT_LABELS[v.kind]}: ${plainText(v.note)}` : VISIT_LABELS[v.kind]))
  return `${placeLabel(place)}. ${visits.join('. ')}.`
}

// All the land dots as one path of zero-length strokes with round caps: thousands of dots, one element.
export const DOTS_PATH = (() => {
  let d = ''
  for (let i = 0; i < WORLD_DOTS.length; i += 2) d += `M${WORLD_DOTS[i]} ${WORLD_DOTS[i + 1]}h0`
  return d
})()

/** The map point under a screen position. */
function toMap(element: SVGSVGElement, view: View, clientX: number, clientY: number): [number, number] {
  const rect = element.getBoundingClientRect()
  const height = (view.width * MAP_HEIGHT) / MAP_WIDTH
  return [view.x + ((clientX - rect.left) / rect.width) * view.width, view.y + ((clientY - rect.top) / rect.height) * height]
}

function clampView(view: View): View {
  const width = Math.min(MAP_WIDTH, Math.max(MAP_WIDTH / MAX_ZOOM, view.width))
  const height = (width * MAP_HEIGHT) / MAP_WIDTH
  return {
    width,
    x: Math.min(MAP_WIDTH - width, Math.max(0, view.x)),
    y: Math.min(MAP_HEIGHT - height, Math.max(0, view.y)),
  }
}

/** The view zoomed by `factor` (>1 zooms in), keeping map point (px, py) where it is on screen. */
function zoomAround(view: View, factor: number, px: number, py: number): View {
  const width = view.width / factor
  return clampView({ width, x: px - (px - view.x) / factor, y: py - (py - view.y) / factor })
}

export interface WorldMapProps {
  places: Place[]
  colors: AboutColors['places']
  /** A city being added: drawn as a ring, and the map zooms to it. */
  highlight?: { longitude: number; latitude: number; label: string } | null
  /** Editing: clicking a pin calls this instead of showing its details. */
  onSelect?: (index: number) => void
}

/** The part of the map on show (zoom with the buttons, a pinch or Ctrl/⌘ + scroll; drag to move), the pins, and the place whose card is up. */
export function useWorldMapViewModel({ places, colors, highlight, onSelect }: WorldMapProps) {
  const svg = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<View>(FULL)
  const [active, setActive] = useState<{ index: number; pinned: boolean } | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragged = useRef(false)
  // What the current gesture did, reported once it ends (a scroll-zoom ends when the wheel stops).
  const gesture = useRef<{ zoomed: string | null; moved: boolean }>({ zoomed: null, moved: false })
  const wheelEnd = useRef<number | undefined>(undefined)
  const report = () => {
    const { zoomed, moved } = gesture.current
    if (zoomed) trackEvent('Zoomed the map', { how: zoomed })
    else if (moved) trackEvent('Moved the map')
    gesture.current = { zoomed: null, moved: false }
  }
  // The map's width on screen, to keep pins the same size on a phone as on a desktop.
  const [screenWidth, setScreenWidth] = useState(800)
  useEffect(() => {
    const element = svg.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setScreenWidth(entry.contentRect.width || 800))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const zoom = MAP_WIDTH / view.width
  const height = (view.width * MAP_HEIGHT) / MAP_WIDTH
  const pins = useMemo(() => places.map((place) => project(place.longitude, place.latitude)), [places])

  // Zoom to a city being added, once each time a different one is picked.
  const highlightKey = highlight ? `${highlight.longitude},${highlight.latitude}` : null
  const [zoomedTo, setZoomedTo] = useState<string | null>(null)
  // Forgotten once the city is added or let go, so picking it again zooms to it again.
  if (!highlight && zoomedTo !== null) setZoomedTo(null)
  if (highlight && highlightKey !== zoomedTo) {
    setZoomedTo(highlightKey)
    const [x, y] = project(highlight.longitude, highlight.latitude)
    const width = Math.min(view.width, MAP_WIDTH / 3)
    setView(clampView({ width, x: x - width / 2, y: y - (width * MAP_HEIGHT) / MAP_WIDTH / 2 }))
  }

  // Ctrl/⌘ + wheel (and trackpad pinches, which arrive as ctrl + wheel) zoom; a plain wheel scrolls the page.
  useEffect(() => {
    const element = svg.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      gesture.current.zoomed = 'scroll'
      window.clearTimeout(wheelEnd.current)
      wheelEnd.current = window.setTimeout(report, 500)
      setView((current) => {
        const [px, py] = toMap(element, current, event.clientX, event.clientY)
        return zoomAround(current, Math.exp(-event.deltaY * 0.01), px, py)
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      window.clearTimeout(wheelEnd.current)
    }
  }, [])

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    dragged.current = false
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous || !svg.current) return
    const rect = svg.current.getBoundingClientRect()
    const current = { x: event.clientX, y: event.clientY }
    if (pointers.current.size === 2) {
      // Pinch: zoom by the change in distance between the two fingers, around their midpoint.
      const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)![1]
      const before = Math.hypot(previous.x - other.x, previous.y - other.y)
      const after = Math.hypot(current.x - other.x, current.y - other.y)
      const [px, py] = toMap(svg.current, view, (current.x + other.x) / 2, (current.y + other.y) / 2)
      if (before > 0) setView((v) => zoomAround(v, after / before, px, py))
      dragged.current = true
      gesture.current.zoomed = 'pinch'
    } else if (zoom > 1) {
      const dx = current.x - previous.x
      const dy = current.y - previous.y
      if (!dragged.current && Math.hypot(dx, dy) < 3) return
      if (!dragged.current) svg.current.setPointerCapture(event.pointerId)
      dragged.current = true
      gesture.current.moved = true
      const unit = view.width / rect.width
      setView((v) => clampView({ ...v, x: v.x - dx * unit, y: v.y - dy * unit }))
    }
    pointers.current.set(event.pointerId, current)
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 0) report()
  }

  const zoomBy = (factor: number) => setView((v) => zoomAround(v, factor, v.x + v.width / 2, v.y + height / 2))

  function show(index: number, pinned: boolean) {
    window.clearTimeout(closeTimer.current)
    if (active?.index !== index && places[index]) trackEvent('Looked at a place on the map', { place: placeLabel(places[index]) })
    setActive((current) => (pinned || !current?.pinned ? { index, pinned } : current))
  }
  // A short delay lets the pointer move from the pin onto the card, to click its links.
  function hideSoon() {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setActive((current) => (current?.pinned ? current : null)), 250)
  }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  function activate(index: number) {
    if (dragged.current) return
    if (onSelect) onSelect(index)
    else setActive((current) => (current?.index === index && current.pinned ? null : { index, pinned: true }))
  }

  const radius = PIN_RADIUS * Math.pow(zoom, 0.25) * (view.width / screenWidth)
  const shown = active && places[active.index] ? { place: places[active.index], at: pins[active.index] } : null
  // Pins over the land dots, with the one being looked at on top.
  const order = places.map((_, i) => i).filter((i) => i !== active?.index)
  if (active && places[active.index]) order.push(active.index)

  return {
    svgRef: svg,
    viewBox: `${view.x} ${view.y} ${view.width} ${height}`,
    zoom,
    zoomed: zoom > 1,
    radius,
    editing: !!onSelect,
    pins: order.map((i) => ({
      key: `${places[i].id}-${i}`,
      transform: `translate(${pins[i][0]} ${pins[i][1]})`,
      label: onSelect ? `Edit ${placeLabel(places[i])}` : describe(places[i]),
      colors: places[i].visits.map((v) => colors[v.kind]),
      onPointerEnter: (e: ReactPointerEvent) => e.pointerType === 'mouse' && !onSelect && show(i, false),
      onPointerLeave: (e: ReactPointerEvent) => e.pointerType === 'mouse' && !onSelect && hideSoon(),
      onFocus: () => !onSelect && show(i, false),
      onBlur: () => !onSelect && hideSoon(),
      onClick: () => activate(i),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          activate(i)
        }
      },
    })),
    highlightAt: highlight ? project(highlight.longitude, highlight.latitude) : null,
    card:
      shown && !onSelect
        ? {
            title: placeLabel(shown.place),
            visits: shown.place.visits.map((visit) => ({ key: visit.kind, color: colors[visit.kind], note: visit.note, label: VISIT_LABELS[visit.kind] })),
            style: { left: `${((shown.at[0] - view.x) / view.width) * 100}%`, top: `${((shown.at[1] - view.y) / height) * 100}%` },
            keepOpen: () => window.clearTimeout(closeTimer.current),
            hideSoon,
          }
        : null,
    svgHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClick: (e: MouseEvent<SVGSVGElement>) => {
        if (e.target === e.currentTarget && !dragged.current) setActive(null)
      },
    },
    onKeyDown: (e: KeyboardEvent) => e.key === 'Escape' && setActive(null),
    controls: {
      canZoomIn: zoom < MAX_ZOOM,
      canZoomOut: zoom > 1,
      zoomIn: () => zoomBy(2),
      zoomOut: () => zoomBy(0.5),
      reset: () => setView(FULL),
    },
  }
}
