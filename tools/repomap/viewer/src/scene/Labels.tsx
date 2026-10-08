import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { hexToRgb, nodeHex, rgbCss } from '../model/colors.ts'
import { useViewer } from '../model/store.ts'
import { projection, updateProjection } from './projection.ts'
import { inkFor, THEMES } from './theme.ts'

/** The 2D canvas drawn on top of the WebGL canvas (set by the Scene). */
export const overlay: { canvas: HTMLCanvasElement | null } = { canvas: null }

// Canvas fonts can't use CSS variables, so the stack is spelled out.
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const widths = new Map<string, number>()
const corner = new THREE.Vector3()
let lastKey = ''

interface Candidate {
  i: number
  priority: number
}

/**
 * Labels are drawn in 2D so they stay crisp and upright. Candidates are ranked (selection, hover,
 * trace, kind priority, size on screen) and placed greedily without overlaps, so zooming in reveals
 * more of them.
 */
export function Labels() {
  useFrame((state) => {
    const canvas = overlay.canvas
    const store = useViewer.getState()
    const { index, visibility } = store
    if (!canvas || !index || !visibility) return
    const { width, height } = state.size
    const moved = updateProjection(index, visibility.nodes, state.camera, width, height, store.version)
    const key = `${store.version}|${store.hovered}|${store.selected}|${store.labels}|${store.theme}|${width}x${height}`
    if (!moved && key === lastKey) return
    lastKey = key
    draw(canvas, width, height, state.camera)
  })
  return null
}

function draw(canvas: HTMLCanvasElement, width: number, height: number, camera: THREE.Camera) {
  const store = useViewer.getState()
  const { index, visibility, trace, selected, hovered, labels, filters } = store
  if (!index || !visibility) return
  const theme = THEMES[store.theme]
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'

  // ---- Layer titles at the near-left corner of each plane
  for (const plane of index.planes) {
    const level = filters.layers[plane.layer] ?? 'show'
    if (level === 'hide' || store.counts?.layers.get(plane.layer)?.shown === 0) continue
    corner.set(plane.minX + 4, plane.y, plane.maxZ - 4).project(camera)
    if (corner.z < -1 || corner.z > 1) continue
    const x = (corner.x * 0.5 + 0.5) * width
    const y = (-corner.y * 0.5 + 0.5) * height
    const layer = index.layerById.get(plane.layer)
    if (!layer) continue
    const color = inkFor(theme, hexToRgb(layer.color))
    ctx.font = `700 12px ${FONT}`
    const text = layer.label.toUpperCase()
    const spaced = text.split('').join(' ')
    ctx.lineWidth = 4
    ctx.strokeStyle = theme.halo
    ctx.strokeText(spaced, x, y + 12)
    ctx.fillStyle = rgbCss(color, level === 'dim' ? 0.45 : 0.95)
    ctx.fillText(spaced, x, y + 12)
  }

  // ---- Node labels
  const candidates: Candidate[] = []
  const margin = 40
  for (let i = 0; i < projection.count; i++) {
    const level = visibility.nodes[i]
    if (level === 0) continue
    const z = projection.z[i]
    if (z < -1 || z > 1) continue
    const x = projection.x[i]
    const y = projection.y[i]
    if (x < -margin || x > width + margin || y < -margin || y > height + margin) continue
    const node = index.nodes[i]
    const member = trace?.nodes.get(i)
    let priority = (index.kinds.get(node.kind)?.labelPriority ?? 3) * 10 + Math.min(20, index.degree[i] * 1.2) + Math.min(40, projection.r[i] * 3)
    if (i === selected) priority = 10_000
    else if (i === hovered) priority = 9_000
    else if (member) priority += member.role === 'root' ? 5_000 : 400
    else if (trace) priority -= 400
    if (level === 1) priority -= 150
    if (labels === 'none' && i !== selected && i !== hovered && !(member && member.role === 'root')) continue
    if (labels === 'auto' && projection.r[i] < 2.2 && priority < 400) continue
    candidates.push({ i, priority })
  }
  candidates.sort((a, b) => b.priority - a.priority)

  const limit = labels === 'all' ? 900 : Math.max(24, Math.min(260, (width * height) / 9000))
  const cell = 48
  const grid = new Map<number, [number, number, number, number][]>()
  const collides = (x0: number, y0: number, x1: number, y1: number) => {
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        for (const r of grid.get(gx * 10007 + gy) ?? []) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true
      }
    }
    return false
  }
  const occupy = (x0: number, y0: number, x1: number, y1: number) => {
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const key = gx * 10007 + gy
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key)!.push([x0, y0, x1, y1])
      }
    }
  }
  // Nodes themselves are obstacles for labels.
  for (const { i } of candidates.slice(0, 400)) {
    const r = Math.max(3, projection.r[i])
    occupy(projection.x[i] - r, projection.y[i] - r, projection.x[i] + r, projection.y[i] + r)
  }

  let placed = 0
  for (const { i, priority } of candidates) {
    if (placed >= limit) break
    const node = index.nodes[i]
    const important = i === selected || i === hovered
    const font = important ? `600 13px ${FONT}` : `500 11.5px ${FONT}`
    const text = node.label.length > 42 ? `${node.label.slice(0, 40)}…` : node.label
    const widthKey = `${font}|${text}`
    let textWidth = widths.get(widthKey)
    if (textWidth === undefined) {
      ctx.font = font
      textWidth = ctx.measureText(text).width
      widths.set(widthKey, textWidth)
    }
    const r = Math.max(3, projection.r[i])
    const x = projection.x[i] + r + 5
    const y = projection.y[i]
    const box: [number, number, number, number] = [x - 2, y - 8, x + textWidth + 2, y + 8]
    if (!important && collides(...box)) continue
    occupy(...box)
    placed++
    const faded = visibility.nodes[i] === 1 || (trace && !trace.nodes.has(i))
    ctx.font = font
    ctx.lineWidth = important ? 4.5 : 3.5
    ctx.strokeStyle = theme.halo
    ctx.strokeText(text, x, y)
    if (important) ctx.fillStyle = theme.text
    else if (priority >= 5_000) ctx.fillStyle = theme.text
    else if (faded) ctx.fillStyle = theme.textDim
    else ctx.fillStyle = rgbCss(inkFor(theme, hexToRgb(nodeHex(index, i, 'kind'))), 0.95)
    ctx.fillText(text, x, y)
  }

  // ---- Unresolved link targets for the selected/hovered node
  for (const i of [selected, hovered]) {
    if (i === null || !filters.showUnresolved) continue
    const links = index.unresolvedByNode.get(i)
    if (!links) continue
    ctx.font = `600 11px ${FONT}`
    links.slice(0, 6).forEach((link, k) => {
      const text = `✕ ${link.target}`
      const x = projection.x[i] + 14
      const y = projection.y[i] - 22 - k * 15
      ctx.lineWidth = 3.5
      ctx.strokeStyle = theme.halo
      ctx.strokeText(text, x, y)
      ctx.fillStyle = '#f43f5e'
      ctx.fillText(text, x, y)
    })
  }
}
