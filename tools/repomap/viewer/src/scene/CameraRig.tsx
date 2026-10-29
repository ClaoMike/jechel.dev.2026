import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { GraphIndex } from '../model/graph.ts'
import { matches, NARROW, REDUCED_MOTION } from '../model/media.ts'
import { useViewer, type CameraCommand } from '../model/store.ts'
import { framing } from './framing.ts'

/**
 * The last camera command carried out. The scene is unmounted while another tab is shown: back on the map, the camera
 * returns where it was (the store's mapView) and only a command given meanwhile (e.g. the Board's "In the 3D map") moves it.
 */
let applied: CameraCommand | null = null

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
    const saved = useViewer.getState().mapView
    if (target && saved) {
      first.current = false
      void target.setLookAt(...saved.position, ...saved.target, false)
    }
    return () => {
      if (!target) return
      const position = new THREE.Vector3()
      const lookAt = new THREE.Vector3()
      target.getPosition(position)
      target.getTarget(lookAt)
      useViewer.getState().saveMapView({ position: position.toArray(), target: lookAt.toArray() })
    }
  }, [])

  useEffect(() => {
    const target = controls.current
    if (!command || !target || !index || size.width === 0 || size.height === 0 || command === applied) return
    applied = command
    const animate = !first.current && !matches(REDUCED_MOTION)
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
