import { Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { hexToRgb, mix, type RGB } from '../model/colors.ts'
import type { GraphIndex } from '../model/graph.ts'
import { useViewer } from '../model/store.ts'
import { inkFor, srgbToLinear, THEMES } from './theme.ts'

const CURVE_SEGMENTS = 14

interface EdgeGeometry {
  positions: Float32Array
  /** First vertex of each edge. */
  start: Uint32Array
  /** Vertex count of each edge (2 per segment). */
  count: Uint16Array
  crossPlane: Uint8Array
}

/**
 * Edges inside a plane are straight; edges between planes are S-curves that leave and enter
 * vertically, so chains read as columns when viewed from the side.
 */
export function edgePoint(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const dy = b.y - a.y
  const u = 1 - t
  const w0 = u * u * u
  const w1 = 3 * u * u * t
  const w2 = 3 * u * t * t
  const w3 = t * t * t
  out.x = a.x * (w0 + w1) + b.x * (w2 + w3)
  out.z = a.z * (w0 + w1) + b.z * (w2 + w3)
  out.y = a.y * w0 + (a.y + dy * 0.5) * w1 + (b.y - dy * 0.5) * w2 + b.y * w3
  return out
}

function buildGeometry(index: GraphIndex): EdgeGeometry {
  const m = index.edges.length
  const start = new Uint32Array(m)
  const count = new Uint16Array(m)
  const crossPlane = new Uint8Array(m)
  let total = 0
  for (let e = 0; e < m; e++) {
    const a = index.edgeFrom[e]
    const b = index.edgeTo[e]
    crossPlane[e] = Math.abs(index.positions[a * 3 + 1] - index.positions[b * 3 + 1]) > 0.5 ? 1 : 0
    start[e] = total
    count[e] = crossPlane[e] ? CURVE_SEGMENTS * 2 : 2
    total += count[e]
  }
  const positions = new Float32Array(total * 3)
  const pa = new THREE.Vector3()
  const pb = new THREE.Vector3()
  const p0 = new THREE.Vector3()
  const p1 = new THREE.Vector3()
  for (let e = 0; e < m; e++) {
    const a = index.edgeFrom[e]
    const b = index.edgeTo[e]
    pa.fromArray(index.positions, a * 3)
    pb.fromArray(index.positions, b * 3)
    let offset = start[e] * 3
    if (!crossPlane[e]) {
      positions.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], offset)
      continue
    }
    for (let s = 0; s < CURVE_SEGMENTS; s++) {
      edgePoint(pa, pb, s / CURVE_SEGMENTS, p0)
      edgePoint(pa, pb, (s + 1) / CURVE_SEGMENTS, p1)
      positions[offset++] = p0.x
      positions[offset++] = p0.y
      positions[offset++] = p0.z
      positions[offset++] = p1.x
      positions[offset++] = p1.y
      positions[offset++] = p1.z
    }
  }
  return { positions, start, count, crossPlane }
}

/** Points of an edge's polyline (for fat trace lines and particles). */
function polyline(geometry: EdgeGeometry, e: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  const first = geometry.start[e]
  const vertices = geometry.count[e]
  for (let v = 0; v < vertices; v += 2) points.push(new THREE.Vector3().fromArray(geometry.positions, (first + v) * 3))
  points.push(new THREE.Vector3().fromArray(geometry.positions, (first + vertices - 1) * 3))
  return points
}

export function Edges() {
  const index = useViewer((s) => s.index)!
  const geometry = useMemo(() => buildGeometry(index), [index])
  return (
    <group>
      <BaseEdges geometry={geometry} />
      <RolledEdges />
      <HoverEdges geometry={geometry} />
      <TraceEdges geometry={geometry} />
      <UnresolvedStubs />
    </group>
  )
}

function BaseEdges({ geometry }: { geometry: EdgeGeometry }) {
  const index = useViewer((s) => s.index)!
  const visibility = useViewer((s) => s.visibility)
  const trace = useViewer((s) => s.trace)
  const themeName = useViewer((s) => s.theme)
  const invalidate = useThree((s) => s.invalidate)

  const buffer = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((geometry.positions.length / 3) * 4), 4))
    g.computeBoundingSphere()
    return g
  }, [geometry])
  useEffect(() => () => buffer.dispose(), [buffer])

  useLayoutEffect(() => {
    const theme = THEMES[themeName]
    const colors = (buffer.getAttribute('color') as THREE.BufferAttribute).array as Float32Array
    const typeColors = new Map<string, RGB>()
    for (const [id, type] of index.edgeTypes) {
      const ink = inkFor(theme, hexToRgb(type.color))
      typeColors.set(id, [srgbToLinear(ink[0]), srgbToLinear(ink[1]), srgbToLinear(ink[2])])
    }
    for (let e = 0; e < index.edges.length; e++) {
      const edge = index.edges[e]
      const level = visibility?.edges[e] ?? 2
      let alpha = 0
      if (level > 0) {
        alpha = edge.type === 'contains' ? 0.1 : geometry.crossPlane[e] ? 0.38 : 0.26
        if (level === 1) alpha = 0.05
        if (edge.source === 'llm') alpha *= 0.7
        alpha *= 0.55 + 0.45 * edge.confidence
        if (trace) alpha = trace.edges.has(e) ? 0 : alpha * 0.14
        alpha = Math.min(1, alpha * theme.edgeAlpha)
      }
      const [r, g, b] = typeColors.get(edge.type) ?? [0.5, 0.5, 0.5]
      const first = geometry.start[e]
      for (let v = 0; v < geometry.count[e]; v++) {
        const o = (first + v) * 4
        colors[o] = r
        colors[o + 1] = g
        colors[o + 2] = b
        colors[o + 3] = alpha
      }
    }
    buffer.getAttribute('color').needsUpdate = true
    invalidate()
  }, [buffer, geometry, index, visibility, trace, themeName, invalidate])

  return (
    <lineSegments geometry={buffer} frustumCulled={false} renderOrder={0}>
      <lineBasicMaterial vertexColors transparent depthWrite={false} />
    </lineSegments>
  )
}

/** Edges of hidden children drawn between their visible parents (dashed). */
function RolledEdges() {
  const index = useViewer((s) => s.index)!
  const rolled = useViewer((s) => s.rolled)
  const trace = useViewer((s) => s.trace)
  const themeName = useViewer((s) => s.theme)
  const buffer = useMemo(() => {
    if (rolled.length === 0) return null
    const theme = THEMES[themeName]
    const positions: number[] = []
    const colors: number[] = []
    const pa = new THREE.Vector3()
    const pb = new THREE.Vector3()
    const p0 = new THREE.Vector3()
    const p1 = new THREE.Vector3()
    for (const edge of rolled) {
      pa.fromArray(index.positions, edge.from * 3)
      pb.fromArray(index.positions, edge.to * 3)
      const ink = inkFor(theme, hexToRgb(index.edgeTypes.get(edge.type)?.color ?? '#94a3b8'))
      const alpha = (edge.level === 1 ? 0.08 : 0.42) * (trace ? 0.2 : 1)
      const color = [srgbToLinear(ink[0]), srgbToLinear(ink[1]), srgbToLinear(ink[2]), alpha]
      const segments = Math.abs(pa.y - pb.y) > 0.5 ? CURVE_SEGMENTS : 1
      for (let s = 0; s < segments; s++) {
        edgePoint(pa, pb, s / segments, p0)
        edgePoint(pa, pb, (s + 1) / segments, p1)
        positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
        colors.push(...color, ...color)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
    return g
  }, [index, rolled, trace, themeName])
  const lines = useRef<THREE.LineSegments>(null)
  useLayoutEffect(() => {
    lines.current?.computeLineDistances()
  }, [buffer])
  useEffect(() => () => buffer?.dispose(), [buffer])
  if (!buffer) return null
  return (
    <lineSegments ref={lines} geometry={buffer} frustumCulled={false}>
      <lineDashedMaterial vertexColors transparent depthWrite={false} dashSize={1.6} gapSize={1.3} />
    </lineSegments>
  )
}

/** The hovered node's edges, brightened, in a small separate buffer. */
function HoverEdges({ geometry }: { geometry: EdgeGeometry }) {
  const index = useViewer((s) => s.index)!
  const hovered = useViewer((s) => s.hovered)
  const visibility = useViewer((s) => s.visibility)
  const themeName = useViewer((s) => s.theme)
  const buffer = useMemo(() => {
    if (hovered === null) return null
    const theme = THEMES[themeName]
    const positions: number[] = []
    const colors: number[] = []
    for (const e of [...index.outEdges[hovered], ...index.inEdges[hovered]]) {
      if (visibility && visibility.edges[e] === 0) continue
      const ink = inkFor(theme, mix(hexToRgb(index.edgeTypes.get(index.edges[e].type)?.color ?? '#94a3b8'), [1, 1, 1], themeName === 'dark' ? 0.25 : 0))
      const color = [srgbToLinear(ink[0]), srgbToLinear(ink[1]), srgbToLinear(ink[2]), 0.95]
      const first = geometry.start[e]
      for (let v = 0; v < geometry.count[e]; v++) {
        positions.push(geometry.positions[(first + v) * 3], geometry.positions[(first + v) * 3 + 1], geometry.positions[(first + v) * 3 + 2])
        colors.push(...color)
      }
    }
    if (positions.length === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
    return g
  }, [geometry, index, hovered, visibility, themeName])
  useEffect(() => () => buffer?.dispose(), [buffer])
  if (!buffer) return null
  return (
    <lineSegments geometry={buffer} frustumCulled={false} renderOrder={3}>
      <lineBasicMaterial vertexColors transparent depthWrite={false} depthTest={false} />
    </lineSegments>
  )
}

const MAX_PARTICLES = 700

/** Trace: thick bright lines plus particles flowing in the direction of each edge. */
function TraceEdges({ geometry }: { geometry: EdgeGeometry }) {
  const index = useViewer((s) => s.index)!
  const trace = useViewer((s) => s.trace)
  const visibility = useViewer((s) => s.visibility)
  const themeName = useViewer((s) => s.theme)
  const size = useThree((s) => s.size)

  const data = useMemo(() => {
    if (!trace) return null
    const theme = THEMES[themeName]
    const points: THREE.Vector3[] = []
    const colors: [number, number, number][] = []
    const paths: { points: THREE.Vector3[]; lengths: number[]; total: number; color: RGB }[] = []
    for (const e of trace.edges) {
      if (visibility && visibility.edges[e] === 0) continue
      const rgb = inkFor(theme, mix(hexToRgb(index.edgeTypes.get(index.edges[e].type)?.color ?? '#94a3b8'), [1, 1, 1], themeName === 'dark' ? 0.15 : 0))
      const dim = visibility && visibility.edges[e] === 1
      const color: [number, number, number] = dim ? (mix(rgb, theme.fade, 0.6) as [number, number, number]) : (rgb as [number, number, number])
      const path = polyline(geometry, e)
      for (let p = 0; p < path.length - 1; p++) {
        points.push(path[p], path[p + 1])
        colors.push(color, color)
      }
      const lengths: number[] = []
      let total = 0
      for (let p = 0; p < path.length - 1; p++) {
        const length = path[p].distanceTo(path[p + 1])
        lengths.push(length)
        total += length
      }
      if (index.edges[e].type !== 'contains' && total > 0.5) paths.push({ points: path, lengths, total, color })
    }
    return { points, colors, paths }
  }, [geometry, index, trace, visibility, themeName])

  const particles = useRef<THREE.InstancedMesh>(null)
  const particleGeometry = useMemo(() => new THREE.SphereGeometry(0.42, 10, 8), [])
  const particleMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: themeName === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }),
    [themeName],
  )
  useEffect(() => () => particleMaterial.dispose(), [particleMaterial])

  useLayoutEffect(() => {
    const mesh = particles.current
    if (!mesh || !data) return
    const color = new THREE.Color()
    let k = 0
    for (const path of data.paths) {
      for (let copy = 0; copy < 2 && k < MAX_PARTICLES; copy++) {
        color.setRGB(path.color[0], path.color[1], path.color[2], THREE.SRGBColorSpace)
        mesh.setColorAt(k++, color)
      }
    }
    mesh.count = k
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [data])

  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    const mesh = particles.current
    if (!mesh || !data || data.paths.length === 0) return
    const time = state.clock.elapsedTime
    let k = 0
    for (let p = 0; p < data.paths.length && k < MAX_PARTICLES; p++) {
      const path = data.paths[p]
      for (let copy = 0; copy < 2 && k < MAX_PARTICLES; copy++) {
        const phase = ((time * 22) / Math.max(path.total, 8) + copy * 0.5 + (p % 7) * 0.13) % 1
        let distance = phase * path.total
        let segment = 0
        while (segment < path.lengths.length - 1 && distance > path.lengths[segment]) distance -= path.lengths[segment++]
        const t = path.lengths[segment] > 0 ? distance / path.lengths[segment] : 0
        point.copy(path.points[segment]).lerp(path.points[segment + 1], Math.min(1, t))
        matrix.makeTranslation(point.x, point.y, point.z)
        mesh.setMatrixAt(k++, matrix)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    state.invalidate()
  })

  if (!data || data.points.length === 0) return null
  return (
    <group>
      <Line
        points={data.points}
        vertexColors={data.colors}
        segments
        lineWidth={2.4}
        transparent
        opacity={0.95}
        depthWrite={false}
        resolution={new THREE.Vector2(size.width, size.height)}
        renderOrder={4}
      />
      <instancedMesh ref={particles} args={[particleGeometry, particleMaterial, MAX_PARTICLES]} frustumCulled={false} renderOrder={5} />
    </group>
  )
}

/** Calls that point at nothing (e.g. a frontend call to a route that doesn't exist): short red stubs. */
function UnresolvedStubs() {
  const index = useViewer((s) => s.index)!
  const visibility = useViewer((s) => s.visibility)
  const filters = useViewer((s) => s.filters)
  const buffer = useMemo(() => {
    if (!filters.showUnresolved || index.unresolvedByNode.size === 0) return null
    const positions: number[] = []
    for (const [i, links] of index.unresolvedByNode) {
      if (visibility && visibility.nodes[i] === 0) continue
      const x = index.positions[i * 3]
      const y = index.positions[i * 3 + 1]
      const z = index.positions[i * 3 + 2]
      links.forEach((_, k) => {
        const angle = (k / Math.max(1, links.length)) * Math.PI * 2 + 0.4
        const reach = 5 + index.radius[i] * 2
        positions.push(x, y, z, x + Math.cos(angle) * reach * 0.6, y + reach, z + Math.sin(angle) * reach * 0.6)
      })
    }
    if (positions.length === 0) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [index, visibility, filters.showUnresolved])
  useEffect(() => () => buffer?.dispose(), [buffer])
  if (!buffer) return null
  return (
    <lineSegments geometry={buffer} frustumCulled={false}>
      <lineBasicMaterial color="#f43f5e" transparent opacity={0.9} depthWrite={false} />
    </lineSegments>
  )
}
