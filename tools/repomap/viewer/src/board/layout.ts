/**
 * Lays a board level out with ELK (layered, orthogonal wires): chips with their pins on fixed ports,
 * so wires leave a function's pin on the right and arrive on the left, like traces on a circuit board.
 */
import type { ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs/lib/elk-api.js'
import type { BoardChip, BoardScene } from './model.ts'

export interface Point {
  x: number
  y: number
}

export interface ChipBox {
  x: number
  y: number
  w: number
  h: number
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
      // As wide as its whole condition: it's the point of the chip, and the board zooms.
      return {
        w: Math.max(150, Math.max(chip.label.length * 7.4, (chip.sub ?? '').length * 6.2, ...chip.pins.map((p) => p.label.length * 6.6)) + 44),
        h: 52 + (chip.pins.length ? chip.pins.length * 15 + 6 : 0),
      }
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

const portId = (chip: string, pin: string | undefined, end: 'in' | 'out') => `${chip}::${pin ?? ''}::${end}`

/** `portrait`: a tall screen (a phone): boards without pins flow downwards and pack tall. */
export interface LayoutHints {
  portrait?: boolean
}

export function elkGraph(scene: BoardScene, hints: LayoutHints = {}): ElkNode {
  const pinless = scene.chips.every((c) => c.kind !== 'node')
  const direction = hints.portrait && pinless && scene.path.level !== 'app' ? 'DOWN' : scene.direction
  const down = direction === 'DOWN'
  const single = scene.path.level === 'chip'
  const partitions = new Set(scene.chips.filter((c) => c.kind !== 'connector').map((c) => c.partition ?? 0))
  const partitioned = partitions.size > 1
  const maxPartition = Math.max(0, ...partitions)
  const children: ElkNode[] = scene.chips.map((chip) => {
    const { w, h } = chipSize(chip, single && chip.kind === 'node')
    const ports: ElkPort[] = []
    const port = (pin: string | undefined, end: 'in' | 'out', y: number) =>
      ports.push({
        id: portId(chip.id, pin, end),
        x: down ? w / 2 : end === 'in' ? 0 : w,
        y: down ? (end === 'in' ? 0 : h) : y,
        width: 1,
        height: 1,
        layoutOptions: { 'elk.port.side': down ? (end === 'in' ? 'NORTH' : 'SOUTH') : end === 'in' ? 'WEST' : 'EAST' },
      })
    const bodyY = chip.kind === 'node' ? 22 : h / 2
    if (chip.kind !== 'connector' || chip.side === 'out') port(undefined, 'in', bodyY)
    if (chip.kind !== 'connector' || chip.side === 'in') port(undefined, 'out', bodyY)
    if (chip.kind === 'node') {
      chip.pins.forEach((pin, k) => {
        if (pin.in) port(pin.id, 'in', pinY(k))
        if (pin.out) port(pin.id, 'out', pinY(k))
      })
    }
    const layoutOptions: Record<string, string> = { 'elk.portConstraints': 'FIXED_POS' }
    if (partitioned) {
      const partition = chip.kind === 'connector' ? (chip.side === 'in' ? 0 : maxPartition + 2) : (chip.partition ?? 0) + 1
      layoutOptions['elk.partitioning.partition'] = String(partition)
    } else if (chip.kind === 'connector') {
      layoutOptions['elk.layered.layering.layerConstraint'] = chip.side === 'in' ? 'FIRST_SEPARATE' : 'LAST_SEPARATE'
    }
    return { id: chip.id, width: w, height: h, ports, layoutOptions }
  })
  const edges: ElkExtendedEdge[] = scene.wires.map((wire) => ({
    id: wire.id,
    sources: [portId(wire.from, wire.fromPin, 'out')],
    targets: [portId(wire.to, wire.toPin, 'in')],
  }))
  return {
    id: 'board',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': down ? '110' : '120',
      'elk.spacing.nodeNode': '30',
      'elk.spacing.edgeEdge': '7',
      'elk.spacing.edgeNode': '16',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '7',
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

export async function layoutScene(scene: BoardScene, elk: ElkLike, hints: LayoutHints = {}): Promise<BoardLayout> {
  const result = await elk.layout(elkGraph(scene, hints))
  const chips = new Map<string, ChipBox>()
  for (const child of result.children ?? []) chips.set(child.id, { x: child.x ?? 0, y: child.y ?? 0, w: child.width ?? 0, h: child.height ?? 0 })
  const wires = new Map<string, Point[]>()
  for (const edge of (result.edges ?? []) as ElkExtendedEdge[]) {
    const section = edge.sections?.[0]
    if (!section) continue
    wires.set(edge.id, [section.startPoint, ...(section.bendPoints ?? []), section.endPoint])
  }
  return { width: result.width ?? 0, height: result.height ?? 0, chips, wires }
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
