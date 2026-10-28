/**
 * Lays a board level out with ELK (layered, orthogonal wires): chips with their pins on fixed ports,
 * so wires leave a function's pin on the right and arrive on the left, like traces on a circuit board.
 */
import type { ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs/lib/elk-api.js'
import type { BoardChip, BoardScene } from './model.ts'
import { nudge, overlaps } from './overlaps.ts'

/** Wires running side by side closer than this read as one: the layout keeps them apart. */
const SEPARATE = 5.5

export interface Point {
  x: number
  y: number
}

export interface ChipBox {
  x: number
  y: number
  w: number
  h: number
  /** Code chips: where the header ends and each pin's row is (centres); rows grow with the wires on them. */
  header?: number
  rows?: number[]
}

export interface BoardLayout {
  width: number
  height: number
  chips: Map<string, ChipBox>
  wires: Map<string, Point[]>
}

/** What layout needs from ELK (the bundled build in the browser and in tests). */
export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>
}

export const HEADER = 44
export const PIN_ROW = 18
const PAD = 10
const CHAR = 7.2

/** A chip's size: its label, then a row per pin. */
export function chipSize(chip: BoardChip, single = false): { w: number; h: number } {
  switch (chip.kind) {
    case 'app':
      return { w: 460, h: 150 + chip.pins.length * 26 }
    case 'tier':
      return { w: Math.max(300, chip.label.length * 11 + 80), h: 120 }
    case 'feature':
    case 'group':
      return { w: Math.max(170, Math.min(280, chip.label.length * 8.4 + 56)), h: 78 }
    case 'state':
      return { w: Math.max(150, Math.min(300, Math.max(chip.label.length * 7, (chip.sub ?? '').length * 6) + 40)), h: 52 }
    case 'connector':
      return { w: Math.max(120, Math.min(240, Math.max(chip.label.length, (chip.sub ?? '').length) * 6.8 + 36)), h: 40 }
    default: {
      const longestPin = chip.pins.reduce((m, p) => Math.max(m, p.label.length), 0)
      const rows = chip.pins.length + (chip.morePins ? 1 : 0)
      const w = Math.max(single ? 280 : 160, Math.min(single ? 420 : 300, Math.max(chip.label.length * 8.2 + 40, longestPin * CHAR + 52)))
      return { w, h: HEADER + rows * PIN_ROW + PAD }
    }
  }
}

/** The y (inside the chip) of a pin's row. */
export function pinY(index: number): number {
  return HEADER + index * PIN_ROW + PIN_ROW / 2
}

/** `portrait`: a tall screen (a phone): boards without pins flow downwards and pack tall. */
export interface LayoutHints {
  portrait?: boolean
}

/** Room each wire gets where it meets a chip: wires never share an attachment point, so they never run together. */
const WIRE_GAP = 9
/** On a pin's row: tighter, as they fan out right away. */
const PIN_GAP = 8

const wirePort = (wire: string, end: 'in' | 'out') => `${wire}::${end}`

/** Where a chip side's wires attach, grouped by the pin they belong to (`''`: the chip itself). */
type Ends = Map<string, { wire: string; end: 'in' | 'out' }[]>

/** Each wire end's position along its side, for ordering: the other end's place in a first layout. */
type Order = Map<string, number>

function endsOf(scene: BoardScene): Map<string, Ends> {
  const byChip = new Map<string, Ends>()
  const add = (chip: string, pin: string | undefined, end: 'in' | 'out', wire: string) => {
    const ends = byChip.get(chip) ?? new Map()
    byChip.set(chip, ends)
    const key = `${pin ?? ''}::${end}`
    const list = ends.get(key) ?? []
    ends.set(key, list)
    list.push({ wire, end })
  }
  for (const wire of scene.wires) {
    add(wire.from, wire.fromPin, 'out', wire.id)
    add(wire.to, wire.toPin, 'in', wire.id)
  }
  return byChip
}

/** A code chip's rows: the header, then each pin's (centre and height), tall enough for the wires on it. */
export function rowsOf(chip: BoardChip, wiresOn: (pin: string) => number): { header: number; rows: number[]; spans: number[]; height: number } {
  const header = Math.max(HEADER, wiresOn('') * WIRE_GAP + 16)
  const rows: number[] = []
  const spans: number[] = []
  let y = header
  for (const pin of chip.pins) {
    const span = Math.max(PIN_ROW, wiresOn(pin.id) * PIN_GAP + 4)
    rows.push(y + span / 2)
    spans.push(span)
    y += span
  }
  return { header, rows, spans, height: y + (chip.morePins ? PIN_ROW : 0) + PAD }
}

/** Spreads `count` points evenly over [from, to]; one sits in the middle. */
function spread(count: number, from: number, to: number): number[] {
  if (count === 1) return [(from + to) / 2]
  const step = (to - from) / (count - 1)
  return Array.from({ length: count }, (_, k) => from + k * step)
}

export function elkGraph(scene: BoardScene, hints: LayoutHints = {}, order?: Order, nodeSpacing = 30): ElkNode {
  const pinless = scene.chips.every((c) => c.kind !== 'node')
  const direction = hints.portrait && pinless && scene.path.level !== 'app' ? 'DOWN' : scene.direction
  const down = direction === 'DOWN'
  const single = scene.path.level === 'chip'
  const partitions = new Set(scene.chips.filter((c) => c.kind !== 'connector').map((c) => c.partition ?? 0))
  const partitioned = partitions.size > 1
  const maxPartition = Math.max(0, ...partitions)
  const ends = endsOf(scene)
  const children: ElkNode[] = scene.chips.map((chip) => {
    const size = chipSize(chip, single && chip.kind === 'node')
    const chipEnds: Ends = ends.get(chip.id) ?? new Map()
    const count = (pin: string) => Math.max(chipEnds.get(`${pin}::in`)?.length ?? 0, chipEnds.get(`${pin}::out`)?.length ?? 0)
    let { w, h } = size
    // A code chip's header and pin rows grow to give every wire on them its own place; a chip without pins grows too.
    const geometry = chip.kind === 'node' && !down ? rowsOf(chip, count) : undefined
    if (geometry) h = geometry.height
    else if (chip.kind !== 'node') {
      const most = Math.max(0, ...[...chipEnds.values()].map((list) => list.length))
      if (down) w = Math.max(w, most * WIRE_GAP + 16)
      else h = Math.max(h, most * WIRE_GAP + 16)
    }
    const ports: ElkPort[] = []
    for (const [key, list] of chipEnds) {
      const [pin, end] = key.split('::') as [string, 'in' | 'out']
      const sorted = order ? [...list].sort((a, b) => (order.get(wirePort(a.wire, a.end)) ?? 0) - (order.get(wirePort(b.wire, b.end)) ?? 0)) : list
      let along: number[]
      if (down) along = spread(sorted.length, 8, w - 8)
      else if (geometry && pin) {
        const k = chip.pins.findIndex((p) => p.id === pin)
        const half = (geometry.spans[k] - PIN_GAP) / 2
        along = spread(sorted.length, geometry.rows[k] - half, geometry.rows[k] + half)
      } else if (geometry) along = spread(sorted.length, 8, geometry.header - 8)
      else along = spread(sorted.length, 8, h - 8)
      sorted.forEach((item, k) =>
        ports.push({
          id: wirePort(item.wire, end),
          x: down ? along[k] : end === 'in' ? 0 : w,
          y: down ? (end === 'in' ? 0 : h) : along[k],
          width: 1,
          height: 1,
          layoutOptions: { 'elk.port.side': down ? (end === 'in' ? 'NORTH' : 'SOUTH') : end === 'in' ? 'WEST' : 'EAST' },
        }),
      )
    }
    const layoutOptions: Record<string, string> = { 'elk.portConstraints': 'FIXED_POS' }
    if (partitioned) {
      const partition = chip.kind === 'connector' ? (chip.side === 'in' ? 0 : maxPartition + 2) : (chip.partition ?? 0) + 1
      layoutOptions['elk.partitioning.partition'] = String(partition)
    } else if (chip.kind === 'connector') {
      layoutOptions['elk.layered.layering.layerConstraint'] = chip.side === 'in' ? 'FIRST_SEPARATE' : 'LAST_SEPARATE'
    }
    return { id: chip.id, width: w, height: h, ports, layoutOptions, ...(geometry ? { geometry } : {}) }
  })
  const edges: ElkExtendedEdge[] = scene.wires.map((wire) => ({
    id: wire.id,
    sources: [wirePort(wire.id, 'out')],
    targets: [wirePort(wire.id, 'in')],
  }))
  return {
    id: 'board',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': down ? '110' : '120',
      'elk.spacing.nodeNode': String(nodeSpacing),
      // Wider than the thickest wire, so wires side by side never touch.
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.edgeNode': '16',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
      'elk.layered.spacing.edgeNodeBetweenLayers': '16',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '60',
      'elk.aspectRatio': hints.portrait ? '0.6' : '1.6',
      'elk.padding': '[top=50,left=50,bottom=50,right=50]',
      ...(partitioned ? { 'elk.partitioning.activate': 'true' } : {}),
    },
    children,
    edges,
  }
}

function read(result: ElkNode): BoardLayout {
  const chips = new Map<string, ChipBox>()
  for (const child of (result.children ?? []) as (ElkNode & { geometry?: { header: number; rows: number[] } })[]) {
    chips.set(child.id, { x: child.x ?? 0, y: child.y ?? 0, w: child.width ?? 0, h: child.height ?? 0, ...(child.geometry ? { header: child.geometry.header, rows: child.geometry.rows } : {}) })
  }
  const wires = new Map<string, Point[]>()
  for (const edge of (result.edges ?? []) as ElkExtendedEdge[]) {
    const section = edge.sections?.[0]
    if (!section) continue
    wires.set(edge.id, [section.startPoint, ...(section.bendPoints ?? []), section.endPoint])
  }
  return { width: result.width ?? 0, height: result.height ?? 0, chips, wires }
}

/**
 * Lays the board out twice: the first pass says where each wire's other end is, the second orders the wires on every
 * side by that, so wires leaving a chip fan out towards their targets instead of crossing on the way out.
 */
export async function layoutScene(scene: BoardScene, elk: ElkLike, hints: LayoutHints = {}): Promise<BoardLayout> {
  const down = elkGraph(scene, hints).layoutOptions?.['elk.direction'] === 'DOWN'
  const first = read(await elk.layout(elkGraph(scene, hints)))
  let best = read(await elk.layout(elkGraph(scene, hints, orderFrom(scene, first, down))))
  let count = overlaps(best, 2, SEPARATE).length
  // Two wires can still meet where one leaves a chip at the height another arrives at (the chips moved since the
  // order was taken): order again from the new layout, with a little more room between chips; keep the best.
  for (const spacing of [30, 37, 44, 52]) {
    if (count === 0) break
    const next = read(await elk.layout(elkGraph(scene, hints, orderFrom(scene, best, down), spacing)))
    const n = overlaps(next, 2, SEPARATE).length
    if (n < count) [best, count] = [next, n]
  }
  if (count > 0) nudge(best, SEPARATE)
  return best
}

/** Each wire end's place along its side: where the wire goes next (its first bend leaving, its last bend arriving). */
function orderFrom(scene: BoardScene, layout: BoardLayout, down: boolean): Order {
  const order: Order = new Map()
  for (const wire of scene.wires) {
    const points = layout.wires.get(wire.id)
    if (!points || points.length < 2) continue
    const start = points[0]
    const finish = points[points.length - 1]
    const leaving = points[1]
    const arriving = points[points.length - 2]
    order.set(wirePort(wire.id, 'out'), down ? finish.x + leaving.x / 1e4 : finish.y + leaving.y / 1e4)
    order.set(wirePort(wire.id, 'in'), down ? start.x + arriving.x / 1e4 : start.y + arriving.y / 1e4)
  }
  return order
}

/** An orthogonal polyline with rounded corners, as an SVG path. */
export function wirePath(points: Point[], radius = 8): string {
  if (points.length === 0) return ''
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const at = points[i]
    const next = points[i + 1]
    const inLen = Math.hypot(at.x - prev.x, at.y - prev.y)
    const outLen = Math.hypot(next.x - at.x, next.y - at.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const before = { x: at.x - ((at.x - prev.x) / (inLen || 1)) * r, y: at.y - ((at.y - prev.y) / (inLen || 1)) * r }
    const after = { x: at.x + ((next.x - at.x) / (outLen || 1)) * r, y: at.y + ((next.y - at.y) / (outLen || 1)) * r }
    d += ` L${before.x},${before.y} Q${at.x},${at.y} ${after.x},${after.y}`
  }
  const last = points[points.length - 1]
  return `${d} L${last.x},${last.y}`
}
