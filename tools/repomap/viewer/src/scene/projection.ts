/**
 * Screen-space positions of all nodes, refreshed once per rendered frame when the camera moves.
 * Shared by label placement and picking (hover/click), which is simpler and more forgiving than
 * raycasting thousands of small instanced meshes.
 */
import * as THREE from 'three'
import type { GraphIndex } from '../model/graph.ts'

export const projection = {
  count: 0,
  width: 1,
  height: 1,
  x: new Float32Array(0),
  y: new Float32Array(0),
  /** NDC depth; outside [-1, 1] means clipped. */
  z: new Float32Array(0),
  /** Radius on screen in CSS pixels. */
  r: new Float32Array(0),
  level: new Uint8Array(0) as Uint8Array,
  cameraKey: '',
  version: -1,
}

const vector = new THREE.Vector3()

export function updateProjection(
  index: GraphIndex,
  levels: Uint8Array,
  camera: THREE.Camera,
  width: number,
  height: number,
  version: number,
): boolean {
  const key = `${camera.matrixWorld.elements.join(',')}|${width}x${height}`
  if (key === projection.cameraKey && version === projection.version && projection.count === index.nodes.length) return false
  const n = index.nodes.length
  if (projection.x.length !== n) {
    projection.x = new Float32Array(n)
    projection.y = new Float32Array(n)
    projection.z = new Float32Array(n)
    projection.r = new Float32Array(n)
  }
  projection.count = n
  projection.width = width
  projection.height = height
  projection.level = levels
  const perspective = camera as THREE.PerspectiveCamera
  const focal = height / 2 / Math.tan(((perspective.fov ?? 45) * Math.PI) / 360)
  const cameraPosition = camera.position
  for (let i = 0; i < n; i++) {
    vector.set(index.positions[i * 3], index.positions[i * 3 + 1], index.positions[i * 3 + 2])
    const distance = vector.distanceTo(cameraPosition)
    vector.project(camera)
    projection.x[i] = (vector.x * 0.5 + 0.5) * width
    projection.y[i] = (-vector.y * 0.5 + 0.5) * height
    projection.z[i] = vector.z
    projection.r[i] = (index.radius[i] * focal) / Math.max(distance, 0.001)
  }
  projection.cameraKey = key
  projection.version = version
  return true
}

/** The visible node closest to a screen point (within its radius + a few pixels), or null. */
export function pick(x: number, y: number, slack = 6): number | null {
  let best: number | null = null
  let bestScore = Infinity
  for (let i = 0; i < projection.count; i++) {
    if (projection.level[i] === 0) continue
    const z = projection.z[i]
    if (z < -1 || z > 1) continue
    const dx = projection.x[i] - x
    const dy = projection.y[i] - y
    const reach = Math.max(projection.r[i], 5) + slack
    const distance = Math.hypot(dx, dy)
    if (distance > reach) continue
    // Prefer shown over dimmed, then closer to the pointer, then nearer to the camera.
    const score = distance / reach + (projection.level[i] === 1 ? 1 : 0) + z * 0.05
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}
