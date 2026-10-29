/**
 * The Board tab: the app as circuit boards you zoom through. Each level is laid out by ELK and drawn
 * as SVG — chips with pins, copper wires between them, connectors to what lies off the board.
 * Zooming far into a chip opens it (the level below); zooming far out goes up a level.
 */
import ELK from 'elkjs/lib/elk.bundled.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { onServerEvent } from '../model/events.ts'
import { useMediaQuery } from '../model/media.ts'
import { serverInfo } from '../model/server.ts'
import { useViewer } from '../model/store.ts'
import { Icon } from '../ui/icons.tsx'
import { BoardPanel } from './BoardPanel.tsx'
import { chipSize, HEADER, laneBoxes, layoutScene, pinY, wirePath, type BoardLayout, type ChipBox } from './layout.ts'
import { architectureTrail, buildScene, indexBoard, parentPath, trailOf, type BoardChip, type BoardScene, type BoardWire } from './model.ts'
import { useBoard, type AiJob } from './store.ts'

const elk = new ELK()

interface View {
  x: number
  y: number
  k: number
}

/** Zooming past these (relative to "fit") opens the chip in the middle / goes up a level. */
const ENTER_AT = 2.6
const LEAVE_AT = 0.55

export default function BoardView() {
  const index = useViewer((s) => s.index)
  const theme = useViewer((s) => s.theme)
  const path = useBoard((s) => s.path)
  const history = useBoard((s) => s.history)
  const options = useBoard((s) => s.options)
  const review = useBoard((s) => s.review)
  const selected = useBoard((s) => s.selected)
  const focus = useBoard((s) => s.focus)
  const motion = useBoard((s) => s.motion)
  const bi = useMemo(() => (index ? indexBoard(index) : null), [index])
  const marks = useMemo(() => (review ? { touched: review.touched, impacted: review.impacted } : undefined), [review])
  const scene = useMemo(() => (bi ? buildScene(bi, path, options, marks) : null), [bi, path, options, marks])
  const [layout, setLayout] = useState<{ scene: BoardScene; layout: BoardLayout } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const portrait = useMediaQuery('(max-aspect-ratio: 4/5)')

  useEffect(() => {
    void serverInfo().then((info) => useBoard.getState().setAiAvailable(!!info.boardAi))
    return onServerEvent('board-ai', (data) => useBoard.getState().setAi(data as AiJob))
  }, [])

  useEffect(() => {
    if (!scene) return
    let cancelled = false
    setError(null)
    layoutScene(scene, elk, { portrait })
      .then((result) => !cancelled && setLayout({ scene, layout: result }))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [scene, portrait])

  if (!index || !bi) return null
  const trail = trailOf(bi, history, path, index.graph.meta.repo.name)
  const place = architectureTrail(bi, path)
  const current = layout && layout.scene === scene ? layout : null
  return (
    <div className="board-workspace">
      <div className={`board-stage theme-${theme}`} data-testid="board-stage">
        <div className="board-trails">
          <nav className="board-trail" aria-label="Board level">
            {trail.map((step, k) => (
              <span key={k} className="board-trail-step">
                {k > 0 && <span aria-hidden="true">›</span>}
                <button
                  type="button"
                  className={k === trail.length - 1 ? 'current' : ''}
                  aria-current={k === trail.length - 1 ? 'location' : undefined}
                  onClick={() => k < trail.length - 1 && useBoard.getState().goToStep(step.path, step.history)}
                  data-testid={`board-trail-${k}`}
                >
                  {step.label}
                </button>
              </span>
            ))}
          </nav>
          {place && (
            <nav className="board-arch" aria-label="Place in the architecture" data-testid="board-architecture">
              {place.map((step, k) => (
                <span key={k} className={`board-arch-step ${step.kind}`}>
                  {k > 0 && <span aria-hidden="true">›</span>}
                  {step.path && k < place.length - 1 ? (
                    <button type="button" title={step.title} onClick={() => useBoard.getState().navigate(step.path!, 'out')}>
                      {step.label}
                    </button>
                  ) : (
                    <span title={step.title} aria-current={k === place.length - 1 ? 'location' : undefined}>
                      {step.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>
        {current ? (
          <Board
            key={JSON.stringify(path)}
            scene={current.scene}
            layout={current.layout}
            selected={selected}
            focusIds={focus ? new Set(focus.map((i) => index.nodes[bi.rootOf[i]].id)) : null}
            motion={motion}
          />
        ) : (
          <div className="status">
            {error ? (
              <p>Could not lay this level out: {error}</p>
            ) : (
              <>
                <div className="spinner" aria-hidden="true" />
                <p>Laying out the board…</p>
              </>
            )}
          </div>
        )}
        {current?.scene.note && <div className="board-note">{current.scene.note}</div>}
        <Legend />
      </div>
      <BoardPanel bi={bi} scene={current?.scene ?? null} />
    </div>
  )
}

function Legend() {
  const review = useBoard((s) => s.review)
  return (
    <div className="board-legend" aria-label="Legend">
      <span>
        <i className="lg-wire" /> wire: thicker = more connections
      </span>
      <span>
        <i className="lg-wire conditional" /> shown only when a condition holds
      </span>
      <span>
        <i className="lg-state" /> a state: what the component shows then is wired to its right
      </span>
      <span>
        <i className="lg-wire bad" /> breaks a rule
      </span>
      {review && (
        <>
          <span>
            <i className="lg-dot touched" /> changed
          </span>
          <span>
            <i className="lg-dot impacted" /> may be affected
          </span>
        </>
      )}
    </div>
  )
}

interface BoardProps {
  scene: BoardScene
  layout: BoardLayout
  selected: string | null
  focusIds: Set<string> | null
  motion: 'in' | 'out' | null
}

function Board({ scene, layout, selected, focusIds, motion }: BoardProps) {
  const history = useBoard((s) => s.history)
  const stage = useRef<HTMLDivElement>(null)
  const group = useRef<SVGGElement>(null)
  const grid = useRef<SVGPatternElement>(null)
  const view = useRef<View>({ x: 0, y: 0, k: 1 })
  const fit = useRef<View>({ x: 0, y: 0, k: 1 })
  const [zoomClass, setZoomClass] = useState('lod-0')
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  /** `target`: what the first finger went down on (pointer capture makes later events point at the stage). */
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; target?: Element; pinch?: { d: number; k: number; cx: number; cy: number } } | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const interacted = useRef(false)

  const apply = useCallback(() => {
    const { x, y, k } = view.current
    group.current?.setAttribute('transform', `translate(${x},${y}) scale(${k})`)
    grid.current?.setAttribute('patternTransform', `translate(${x},${y}) scale(${k})`)
    const relative = k / fit.current.k
    const lod = k < 0.28 ? 'lod-2' : k < 0.42 ? 'lod-1' : 'lod-0'
    setZoomClass((previous) => (previous === lod ? previous : lod))
    stage.current?.style.setProperty('--zoom', String(relative))
  }, [])

  const fitView = useCallback(() => {
    const el = stage.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const pad = 24
    const top = 44
    const k = Math.min(2, Math.max(0.05, Math.min((width - pad * 2) / Math.max(1, layout.width), (height - top - pad * 2) / Math.max(1, layout.height))))
    fit.current = { k, x: (width - layout.width * k) / 2, y: top + (height - top - layout.height * k) / 2 }
    view.current = { ...fit.current }
    apply()
  }, [apply, layout])

  useLayoutEffect(() => {
    fitView()
    const el = stage.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!interacted.current) fitView()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [fitView])

  // Toolbar/keyboard commands for the stage.
  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail
      if (command === 'fit') fitView()
      else if (command === 'in' || command === 'out') {
        const el = stage.current!.getBoundingClientRect()
        zoomAt(el.width / 2, el.height / 2, command === 'in' ? 1.4 : 1 / 1.4)
        scheduleSettle()
      }
    }
    window.addEventListener('repomap:board', onCommand)
    return () => window.removeEventListener('repomap:board', onCommand)
  })

  const chipAt = (sx: number, sy: number): BoardChip | undefined => {
    const { x, y, k } = view.current
    const bx = (sx - x) / k
    const by = (sy - y) / k
    return scene.chips.find((chip) => {
      const box = layout.chips.get(chip.id)
      return box && bx >= box.x && bx <= box.x + box.w && by >= box.y && by <= box.y + box.h
    })
  }

  const zoomAt = (sx: number, sy: number, factor: number) => {
    interacted.current = true
    const v = view.current
    const min = fit.current.k * 0.4
    const max = Math.max(fit.current.k * 8, 3)
    const k = Math.min(max, Math.max(min, v.k * factor))
    view.current = { k, x: sx - ((sx - v.x) * k) / v.k, y: sy - ((sy - v.y) * k) / v.k }
    apply()
  }

  /** After a zoom gesture: far enough in on a chip opens it, far enough out goes up. */
  const scheduleSettle = () => {
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const el = stage.current
      if (!el) return
      const relative = view.current.k / fit.current.k
      const { width, height } = el.getBoundingClientRect()
      const store = useBoard.getState()
      if (relative >= ENTER_AT) {
        const chip = chipAt(width / 2, height / 2)
        if (chip?.enter && chip.kind !== 'connector') store.navigate(chip.enter, 'in')
      } else if (relative <= LEAVE_AT) {
        store.back()
      }
    }, 220)
  }

  useEffect(() => () => clearTimeout(settle.current), [])

  // Wheel zoom (also trackpad pinch, which arrives as ctrl+wheel); passive listeners can't prevent scrolling.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      if (event.ctrlKey || !event.shiftKey) zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0022)))
      scheduleSettle()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button, a, input')) return
    const rect = stage.current!.getBoundingClientRect()
    pointers.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    if (pointers.current.size === 1) gesture.current = { moved: false, startX: event.clientX, startY: event.clientY, target: event.target as Element }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { moved: true, startX: 0, startY: 0, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 } }
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous || !gesture.current) return
    const rect = stage.current!.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    pointers.current.set(event.pointerId, point)
    const g = gesture.current
    if (g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const target = (g.pinch.k * d) / Math.max(1, g.pinch.d)
      // Pan with the fingers' midpoint, zoom around it.
      view.current = { ...view.current, x: view.current.x + cx - g.pinch.cx, y: view.current.y + cy - g.pinch.cy }
      g.pinch.cx = cx
      g.pinch.cy = cy
      zoomAt(cx, cy, target / view.current.k)
      return
    }
    if (!g.moved && Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < 5) return
    g.moved = true
    interacted.current = true
    view.current = { ...view.current, x: view.current.x + point.x - previous.x, y: view.current.y + point.y - previous.y }
    apply()
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    pointers.current.delete(event.pointerId)
    if (g?.pinch) {
      if (pointers.current.size === 0) {
        gesture.current = null
        scheduleSettle()
      }
      return
    }
    gesture.current = null
    if (!g || g.moved) return
    // A tap: on a wire, a chip, or the board.
    const target = g.target ?? (event.target as Element)
    const wireId = target.closest('[data-wire]')?.getAttribute('data-wire')
    const store = useBoard.getState()
    if (wireId) {
      store.select(`wire:${wireId}`)
      return
    }
    const chipId = target.closest('[data-chip]')?.getAttribute('data-chip')
    if (!chipId) {
      store.select(null)
      return
    }
    // A tap on the selected chip (so also a double-tap) opens it.
    const chip = scene.chips.find((c) => c.id === chipId)
    if (store.selected === chipId && chip?.enter) store.navigate(chip.enter, chip.kind === 'connector' ? null : 'in')
    else store.select(chipId)
  }

  const onKeyDown = (event: ReactKeyboardEvent<SVGGElement>, chip: BoardChip) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    const store = useBoard.getState()
    if (store.selected === chip.id && chip.enter) store.navigate(chip.enter, chip.kind === 'connector' ? null : 'in')
    else store.select(chip.id)
  }

  const selectedChip = selected && !selected.startsWith('wire:') ? selected : null
  const selectedWire = selected?.startsWith('wire:') ? selected.slice(5) : null
  const litWires = useMemo(() => {
    const lit = new Set<string>()
    for (const wire of scene.wires) {
      if (wire.id === selectedWire || (selectedChip && (wire.from === selectedChip || wire.to === selectedChip))) lit.add(wire.id)
      if (focusIds && (focusIds.has(wire.from) || focusIds.has(wire.to))) lit.add(wire.id)
    }
    return lit
  }, [scene, selectedChip, selectedWire, focusIds])
  const dimming = litWires.size > 0
  const neighbours = useMemo(() => {
    const set = new Set<string>()
    for (const wire of scene.wires) if (litWires.has(wire.id)) set.add(wire.from).add(wire.to)
    return set
  }, [scene, litWires])

  return (
    <div
      ref={stage}
      className={`board-canvas ${zoomClass}${motion ? ` enter-${motion}` : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(event) => {
        // Mouse double-click on empty board: zoom in there.
        if ((event.target as Element).closest('[data-chip]')) return
        const rect = stage.current!.getBoundingClientRect()
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, 1.6)
        scheduleSettle()
      }}
    >
      <svg className="board-svg" role="group" aria-label={`Board: ${scene.chips.filter((c) => c.kind !== 'connector').length} chips, ${scene.wires.length} wires`} data-testid="board-svg">
        <defs>
          <pattern ref={grid} id="board-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="1" className="grid-dot" />
          </pattern>
        </defs>
        <rect className="board-backdrop" width="100%" height="100%" fill="url(#board-grid)" />
        <g ref={group} className="board-world">
          <rect className="pcb" x={10} y={10} width={Math.max(0, layout.width - 20)} height={Math.max(0, layout.height - 20)} rx={22} />
          {scene.lanes && <Lanes scene={scene} layout={layout} />}
          <g className="wires">
            {scene.wires.map((wire) => (
              <Wire key={wire.id} wire={wire} points={layout.wires.get(wire.id)} lit={litWires.has(wire.id)} dim={dimming && !litWires.has(wire.id)} />
            ))}
          </g>
          <g className="chips">
            {scene.chips.map((chip) => {
              const box = layout.chips.get(chip.id)
              if (!box) return null
              return (
                <Chip
                  key={chip.id}
                  chip={chip}
                  box={box}
                  single={scene.path.level === 'chip'}
                  selected={chip.id === selectedChip}
                  dim={dimming && !neighbours.has(chip.id) && chip.id !== selectedChip}
                  focused={!!focusIds?.has(chip.id)}
                  onKeyDown={onKeyDown}
                />
              )
            })}
          </g>
        </g>
      </svg>
      <div className="board-zoom" role="group" aria-label="Zoom">
        <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in (past the chip: open it)" onClick={() => window.dispatchEvent(new CustomEvent('repomap:board', { detail: 'in' }))}>
          <Icon name="plus" />
        </button>
        <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out (far enough: up a level)" onClick={() => window.dispatchEvent(new CustomEvent('repomap:board', { detail: 'out' }))}>
          <span aria-hidden="true" className="minus">−</span>
        </button>
        <button type="button" className="icon-button" aria-label="Fit the board" title="Fit (F)" onClick={() => window.dispatchEvent(new CustomEvent('repomap:board', { detail: 'fit' }))}>
          <Icon name="fit" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Up a level"
          title="Up a level (Esc)"
          disabled={!history.length && !parentPath(scene.path)}
          onClick={() => useBoard.getState().back()}
          data-testid="board-up"
        >
          <Icon name="up" />
        </button>
      </div>
    </div>
  )
}

function wireWidth(count: number): number {
  return Math.min(9, 1.6 + Math.log2(count) * 1.3)
}


/** An architecture's layers (Feature-Sliced Design, vertical slices…): a labelled band behind the chips of each. */
function Lanes({ scene, layout }: { scene: BoardScene; layout: BoardLayout }) {
  return (
    <g className="lanes" data-testid="board-lanes">
      {laneBoxes(scene, layout).map((lane) => (
        <g key={lane.partition} className="lane" data-lane={lane.label}>
          <title>{lane.description ? `${lane.label}: ${lane.description}` : lane.label}</title>
          <rect className="lane-band" x={lane.x} y={lane.y} width={lane.w} height={lane.h} rx={14} />
          <text className="lane-label" x={lane.x + 14} y={lane.y + 30}>
            {lane.label}
          </text>
        </g>
      ))}
    </g>
  )
}
function Wire({ wire, points, lit, dim }: { wire: BoardWire; points: { x: number; y: number }[] | undefined; lit: boolean; dim: boolean }) {
  if (!points) return null
  const d = wirePath(points)
  const width = wireWidth(wire.count)
  const cls = `wire${wire.conditional ? ' conditional' : ''}${wire.violation ? ' bad' : ''}${wire.touched ? ' touched' : ''}${lit ? ' lit' : ''}${dim ? ' dim' : ''}`
  const end = points[points.length - 1]
  const start = points[0]
  return (
    <g className={cls} data-wire={wire.id}>
      <path className="wire-hit" d={d} />
      <path className="wire-casing" d={d} strokeWidth={width + 3} />
      <path className="wire-core" d={d} strokeWidth={width} />
      {lit && <path className="wire-flow" d={d} strokeWidth={Math.max(1.2, width / 2.5)} />}
      <circle className="wire-via" cx={start.x} cy={start.y} r={width / 2 + 1.5} />
      <circle className="wire-via" cx={end.x} cy={end.y} r={width / 2 + 1.5} />
      <title>{`${wire.count} connection${wire.count === 1 ? '' : 's'}: ${Object.entries(wire.types)
        .map(([t, n]) => `${n} ${t}`)
        .join(', ')}`}</title>
    </g>
  )
}

const MEMBER_COLORS: Record<string, string> = {
  function: '#22d3ee',
  method: '#22d3ee',
  constructor: '#67e8f9',
  prop: '#f472b6',
  param: '#f9a8d4',
  state: '#fbbf24',
  value: '#a3e635',
  property: '#fde68a',
  field: '#d6d3d1',
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text
}

interface ChipProps {
  chip: BoardChip
  box: ChipBox
  single: boolean
  selected: boolean
  dim: boolean
  focused: boolean
  onKeyDown(event: ReactKeyboardEvent<SVGGElement>, chip: BoardChip): void
}

function Chip({ chip, box, single, selected, dim, focused, onKeyDown }: ChipProps) {
  const status = chip.touched > 0 ? 'touched' : chip.impacted > 0 ? 'impacted' : ''
  const cls = `chip-g kind-${chip.kind}${chip.ghost ? ' ghost' : ''}${selected ? ' selected' : ''}${dim ? ' dim' : ''}${focused ? ' focused' : ''}${status ? ` ${status}` : ''}`
  const label = `${chip.label}${chip.sub ? `, ${chip.sub}` : ''}${chip.enter && chip.kind !== 'connector' ? '. Press Enter twice to open' : ''}`
  const common = { className: cls, transform: `translate(${box.x},${box.y})`, 'data-chip': chip.id, role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': selected, onKeyDown: (e: ReactKeyboardEvent<SVGGElement>) => onKeyDown(e, chip) }
  const maxChars = Math.floor((box.w - 28) / 7.4)
  const badges = <Badges chip={chip} x={box.w - 8} />

  if (chip.kind === 'connector') {
    const arrowLeft = chip.side === 'out'
    return (
      <g {...common}>
        <rect className="connector-body" width={box.w} height={box.h} rx={box.h / 2} style={{ stroke: chip.color }} />
        <text className="connector-arrow" x={arrowLeft ? 14 : box.w - 14} y={box.h / 2 + 4} textAnchor="middle" aria-hidden="true">
          ▸
        </text>
        <text className="chip-label small" x={arrowLeft ? 26 : 16} y={chip.sub ? 17 : 24}>
          {truncate(chip.label, Math.floor((box.w - 38) / 6.6))}
        </text>
        {chip.sub && (
          <text className="chip-sub" x={arrowLeft ? 26 : 16} y={31}>
            {truncate(chip.sub, Math.floor((box.w - 38) / 5.8))}
          </text>
        )}
      </g>
    )
  }

  // A state of its component: a lozenge between it and what it shows then.
  if (chip.kind === 'state') {
    return (
      <g {...common}>
        <rect className="state-body" width={box.w} height={box.h} rx={box.h / 2} />
        <text className="state-caption" x={18} y={16}>
          STATE
        </text>
        <text className="chip-label small mono" x={18} y={30}>
          {chip.label}
        </text>
        <rect className="chip-focus-ring" x={-4} y={-4} width={box.w + 8} height={box.h + 8} rx={box.h / 2 + 4} />
      </g>
    )
  }

  if (chip.kind === 'app' || chip.kind === 'tier' || chip.kind === 'feature' || chip.kind === 'group') {
    const big = chip.kind === 'app' || chip.kind === 'tier'
    return (
      <g {...common}>
        <Legs w={box.w} h={box.h} count={big ? Math.round(box.w / 26) : Math.round(box.w / 30)} />
        <rect className="chip-body" width={box.w} height={box.h} rx={8} />
        <rect className="chip-stripe" width={box.w} height={5} rx={2} style={{ fill: chip.color }} />
        <circle className="chip-notch" cx={14} cy={18} r={3.5} />
        <text className={`chip-label${big ? ' big' : ''}`} x={26} y={big ? 30 : 26}>
          {truncate(chip.label, Math.floor((box.w - 50) / (big ? 10 : 7.6)))}
        </text>
        {chip.sub && (
          <text className="chip-sub" x={26} y={big ? 50 : 44}>
            {chip.sub}
          </text>
        )}
        {chip.palette && (
          <g transform={`translate(16,${big ? 66 : 56})`}>
            {(() => {
              const total = chip.palette.reduce((s, p) => s + p.weight, 0) || 1
              let x = 0
              const width = box.w - 32
              return chip.palette.map((p, k) => {
                const w = (p.weight / total) * width
                const rect = <rect key={k} className="palette" x={x} width={Math.max(0, w - 1)} height={8} rx={2} style={{ fill: p.color }} />
                x += w
                return rect
              })
            })()}
          </g>
        )}
        {chip.kind === 'app' &&
          chip.pins.map((pin, k) => (
            <text key={pin.id} className="chip-pin" x={26} y={102 + k * 26}>
              ▸ {pin.label}
            </text>
          ))}
        {chip.summary && !big && <circle className="summary-dot" cx={box.w - 14} cy={box.h - 14} r={4}><title>Has an AI summary</title></circle>}
        {badges}
        {chip.enter && <text className="chip-hint" x={box.w - 12} y={box.h - 10} textAnchor="end">{chip.kind === 'app' ? 'zoom in ⤢' : ''}</text>}
      </g>
    )
  }

  // A code chip: header, then a row per pin with leads where wires attach.
  const width = chipSize(chip, single).w
  return (
    <g {...common}>
      <rect className="chip-body" width={box.w} height={box.h} rx={6} />
      <rect className="chip-stripe" width={box.w} height={4} rx={2} style={{ fill: chip.color }} />
      <circle className="chip-notch" cx={12} cy={16} r={3} />
      <text className="chip-label" x={22} y={20}>
        {truncate(chip.label, maxChars)}
      </text>
      {chip.sub && (
        <text className="chip-sub" x={22} y={35}>
          {truncate(chip.sub, Math.floor((width - 30) / 6))}
        </text>
      )}
      <line className="chip-rule" x1={8} x2={box.w - 8} y1={HEADER - 4} y2={HEADER - 4} />
      {chip.pins.map((pin, k) => {
        const y = pinY(k)
        const color = pin.member ? (MEMBER_COLORS[pin.kind] ?? '#94a3b8') : '#e2e8f0'
        return (
          <g key={pin.id} className={`pin${pin.in || pin.out ? ' wired' : ''}`} data-pin={pin.id}>
            {pin.in && <line className="lead" x1={-7} x2={0} y1={y} y2={y} />}
            {pin.out && <line className="lead" x1={box.w} x2={box.w + 7} y1={y} y2={y} />}
            <rect className="pin-mark" x={10} y={y - 4} width={8} height={8} rx={pin.member ? 4 : 1.5} style={{ fill: color }} />
            <text className="chip-pin" x={24} y={y + 4}>
              {truncate(pin.label, Math.floor((box.w - 34) / 6.7))}
            </text>
            {pin.member?.type && single && (
              <text className="chip-pin-type" x={box.w - 10} y={y + 4} textAnchor="end">
                {truncate(pin.member.type, Math.max(4, Math.floor((box.w - 40) / 6.7) - pin.label.length - 2))}
              </text>
            )}
          </g>
        )
      })}
      {chip.morePins ? (
        <text className="chip-more" x={24} y={pinY(chip.pins.length) + 4}>
          + {chip.morePins} more inside
        </text>
      ) : null}
      {badges}
      <rect className="chip-focus-ring" x={-4} y={-4} width={box.w + 8} height={box.h + 8} rx={9} />
    </g>
  )
}

/** Small legs along the long sides of the bigger chips (a DIP package). */
function Legs({ w, h, count }: { w: number; h: number; count: number }) {
  const legs = []
  const step = w / (count + 1)
  for (let k = 1; k <= count; k++) {
    legs.push(<rect key={`t${k}`} className="leg" x={k * step - 3} y={-5} width={6} height={6} rx={1} />)
    legs.push(<rect key={`b${k}`} className="leg" x={k * step - 3} y={h - 1} width={6} height={6} rx={1} />)
  }
  return <g aria-hidden="true">{legs}</g>
}

function Badges({ chip, x }: { chip: BoardChip; x: number }) {
  const items: { cls: string; text: string; title: string }[] = []
  if (chip.touched) items.push({ cls: 'touched', text: String(chip.touched), title: `${chip.touched} changed` })
  if (chip.impacted) items.push({ cls: 'impacted', text: String(chip.impacted), title: `${chip.impacted} may be affected` })
  if (chip.violations) items.push({ cls: 'bad', text: String(chip.violations), title: `${chip.violations} rule violation${chip.violations === 1 ? '' : 's'}` })
  if (chip.summary?.stale) items.push({ cls: 'stale', text: '~', title: 'AI summary is out of date' })
  let right = x
  return (
    <g className="badges">
      {items.map((item) => {
        const w = Math.max(18, item.text.length * 7 + 10)
        right -= w + 4
        return (
          <g key={item.cls} transform={`translate(${right + 4},${8})`} className={`badge ${item.cls}`}>
            <rect width={w} height={16} rx={8} />
            <text x={w / 2} y={12} textAnchor="middle">
              {item.text}
            </text>
            <title>{item.title}</title>
          </g>
        )
      })}
    </g>
  )
}
