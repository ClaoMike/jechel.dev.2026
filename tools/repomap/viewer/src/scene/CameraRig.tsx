import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { GraphIndex } from '../model/graph.ts'
import { matches, NARROW } from '../model/media.ts'
import { useViewer } from '../model/store.ts'

const HOME_DIRECTION = new THREE.Vector3(0.62, 0.55, 0.9).normalize()
/** Portrait screens: a lower angle makes the layer stack taller, filling the height instead of the width. */
const PORTRAIT_HOME_DIRECTION = new THREE.Vector3(0.55, 0.36, 0.9).normalize()

/**
 * Orbit (left drag / one finger), pan (right drag, Shift+drag or two fingers), zoom to cursor
 * (wheel/pinch), with smooth transitions for fit, focus, top-down layer views and the side view.
 */
export function CameraRig() {
  const controls = useRef<CameraControlsImpl>(null)
  const command = useViewer((s) => s.camera)
  const index = useViewer((s) => s.index)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const first = useRef(true)

  useEffect(() => {
    const target = controls.current
    if (!command || !target || !index || size.width === 0 || size.height === 0) return
    const animate = !first.current
    first.current = false
    const visibility = useViewer.getState().visibility
    const aspect = size.width / size.height
    const home = aspect < 0.8 ? PORTRAIT_HOME_DIRECTION : HOME_DIRECTION
    const currentDirection = () => {
      const position = new THREE.Vector3()
      const lookAt = new THREE.Vector3()
      target.getPosition(position)
      target.getTarget(lookAt)
      const d = position.sub(lookAt)
      return d.lengthSq() > 1e-6 ? d.normalize() : home.clone()
    }
    // On phones the details sheet covers the bottom of the view while something is selected.
    const bottomInset = matches(NARROW) && useViewer.getState().selected !== null ? (window.innerHeight * 0.46) / size.height : 0
    const look = (box: THREE.Box3, direction: THREE.Vector3, minDistance = 0) => {
      const { center, distance } = framing(box, direction, camera, aspect, bottomInset)
      const d = Math.max(distance, minDistance)
      void target.setLookAt(center.x + direction.x * d, center.y + direction.y * d, center.z + direction.z * d, center.x, center.y, center.z, animate)
    }
    switch (command.type) {
      case 'fit':
        look(visibleBox(index, visibility?.nodes), animate ? currentDirection() : home)
        break
      case 'reset':
        look(visibleBox(index, visibility?.nodes), home)
        break
      case 'focus': {
        // Frame the node together with its traced chain, so the context is visible.
        const trace = useViewer.getState().trace
        const box = new THREE.Box3()
        const point = new THREE.Vector3()
        box.expandByPoint(point.fromArray(index.positions, command.node * 3))
        if (trace && trace.root === command.node) {
          for (const i of trace.nodes.keys()) {
            if (visibility && visibility.nodes[i] === 0) continue
            box.expandByPoint(point.fromArray(index.positions, i * 3))
          }
        }
        box.expandByScalar(Math.max(10, index.radius[command.node] * 4))
        look(box, currentDirection(), 60)
        break
      }
      case 'layer': {
        const plane = index.planes.find((p) => p.layer === command.layer)
        if (!plane) break
        const box = new THREE.Box3(new THREE.Vector3(plane.minX, plane.y - 1, plane.minZ), new THREE.Vector3(plane.maxX, plane.y + 1, plane.maxZ))
        look(box, new THREE.Vector3(0, 1, 0.02).normalize())
        break
      }
      case 'side':
        look(visibleBox(index, visibility?.nodes), new THREE.Vector3(0.02, 0.06, 1).normalize())
        break
    }
  }, [command, index, camera, size.width, size.height])

  // Shift + left drag pans.
  useEffect(() => {
    const set = (shift: boolean) => {
      if (!controls.current) return
      controls.current.mouseButtons.left = shift ? CameraControlsImpl.ACTION.TRUCK : CameraControlsImpl.ACTION.ROTATE
    }
    const down = (e: KeyboardEvent) => e.key === 'Shift' && set(true)
    const up = (e: KeyboardEvent) => e.key === 'Shift' && set(false)
    const blur = () => set(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  return (
    <CameraControls
      ref={controls}
      makeDefault
      dollyToCursor
      smoothTime={0.28}
      draggingSmoothTime={0.08}
      minDistance={4}
      maxDistance={index ? index.extent * 12 : 8000}
      azimuthRotateSpeed={0.9}
      polarRotateSpeed={0.9}
      dollySpeed={0.8}
    />
  )
}

/**
 * Where to put the camera so the box fills the view when looking along -direction. Projects the
 * eight corners (tighter than a bounding sphere, which matters on narrow screens) and re-centres the
 * projected picture, so perspective doesn't leave empty space on one side. `bottomInset` is the
 * fraction of the view covered from below (a bottom sheet on phones).
 */
export function framing(
  box: THREE.Box3,
  direction: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  aspect: number,
  bottomInset = 0,
  padding = 1.08,
): { center: THREE.Vector3; distance: number } {
  const d = direction.clone().normalize()
  const forward = d.clone().negate()
  const worldUp = Math.abs(forward.y) > 0.98 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize()
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  const tanV = Math.tan((camera.fov * Math.PI) / 360)
  const tanH = tanV * aspect
  const corners: THREE.Vector3[] = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z))

  // Visible part of the view in NDC (y goes from -1 at the bottom to 1 at the top).
  const inset = Math.min(0.8, Math.max(0, bottomInset))
  const visibleBottom = -1 + 2 * inset
  const targetY = (visibleBottom + 1) / 2
  const halfHeight = (1 - visibleBottom) / 2

  const center = box.getCenter(new THREE.Vector3())
  let distance = Math.max(1, box.getSize(new THREE.Vector3()).length())
  const position = new THREE.Vector3()
  const v = new THREE.Vector3()
  for (let iteration = 0; iteration < 6; iteration++) {
    position.copy(center).addScaledVector(d, distance)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const corner of corners) {
      v.copy(corner).sub(position)
      const depth = Math.max(1e-3, -v.dot(d))
      const x = v.dot(right) / (depth * tanH)
      const y = v.dot(up) / (depth * tanV)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    // Shift so the projected box is centred in the visible area…
    const shiftX = (minX + maxX) / 2
    const shiftY = (minY + maxY) / 2 - targetY
    center.addScaledVector(right, shiftX * tanH * distance).addScaledVector(up, shiftY * tanV * distance)
    // …and move closer/further so it just fits.
    const fill = Math.max((maxX - minX) / 2, (maxY - minY) / 2 / halfHeight) * padding
    distance *= Math.min(4, Math.max(0.25, fill))
  }
  return { center, distance: Math.max(20, distance) }
}

/** Visible nodes plus the outlines of the layers they are on. */
function visibleBox(index: GraphIndex, levels: Uint8Array | undefined): THREE.Box3 {
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  const layers = new Set<string>()
  for (let i = 0; i < index.nodes.length; i++) {
    if (levels && levels[i] === 0) continue
    box.expandByPoint(point.fromArray(index.positions, i * 3))
    layers.add(index.nodes[i].layer)
  }
  if (box.isEmpty()) {
    const [x, y, z] = index.center
    return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y, z), new THREE.Vector3(index.extent, index.extent, index.extent))
  }
  for (const plane of index.planes) {
    if (!layers.has(plane.layer)) continue
    box.expandByPoint(point.set(plane.minX, plane.y, plane.minZ))
    box.expandByPoint(point.set(plane.maxX, plane.y, plane.maxZ))
  }
  return box
}
