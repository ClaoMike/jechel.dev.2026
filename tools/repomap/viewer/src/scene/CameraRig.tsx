import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { GraphIndex } from '../model/graph.ts'
import { useViewer } from '../model/store.ts'

const HOME_DIRECTION = new THREE.Vector3(0.62, 0.55, 0.9).normalize()

/**
 * Orbit (left drag), pan (right drag or Shift+drag), zoom to cursor (wheel/pinch), with smooth
 * transitions for fit, focus, top-down layer views and the side view.
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
    if (!command || !target || !index) return
    const animate = !first.current
    first.current = false
    const visibility = useViewer.getState().visibility
    // camera-controls knows the camera's aspect and FOV; keep a little breathing room.
    const fitDistance = (radius: number) => target.getDistanceToFitSphere(radius) * 0.92
    const direction = () => {
      const current = new THREE.Vector3()
      target.getPosition(current)
      const lookAt = new THREE.Vector3()
      target.getTarget(lookAt)
      const d = current.sub(lookAt)
      return d.lengthSq() > 1e-6 ? d.normalize() : HOME_DIRECTION.clone()
    }
    switch (command.type) {
      case 'fit':
      case 'reset': {
        const { center, radius } = visibleSphere(index, visibility?.nodes)
        const dir = command.type === 'reset' || !animate ? HOME_DIRECTION : direction()
        const distance = fitDistance(radius)
        void target.setLookAt(center.x + dir.x * distance, center.y + dir.y * distance, center.z + dir.z * distance, center.x, center.y, center.z, animate)
        break
      }
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
        const sphere = box.getBoundingSphere(new THREE.Sphere())
        const dir = direction()
        const distance = Math.max(80, fitDistance(Math.max(24, sphere.radius)))
        const c = sphere.center
        void target.setLookAt(c.x + dir.x * distance, c.y + dir.y * distance, c.z + dir.z * distance, c.x, c.y, c.z, animate)
        break
      }
      case 'layer': {
        const plane = index.planes.find((p) => p.layer === command.layer)
        if (!plane) break
        const cx = (plane.minX + plane.maxX) / 2
        const cz = (plane.minZ + plane.maxZ) / 2
        const radius = Math.max(plane.maxX - plane.minX, plane.maxZ - plane.minZ) / 2
        const distance = fitDistance(radius) * 0.95
        void target.setLookAt(cx, plane.y + distance, cz + distance * 0.02, cx, plane.y, cz, animate)
        break
      }
      case 'side': {
        const { center, radius } = visibleSphere(index, visibility?.nodes)
        const distance = fitDistance(radius)
        void target.setLookAt(center.x + distance * 0.02, center.y + distance * 0.06, center.z + distance, center.x, center.y, center.z, animate)
        break
      }
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
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', () => set(false))
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
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

function visibleSphere(index: GraphIndex, levels: Uint8Array | undefined): { center: THREE.Vector3; radius: number } {
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  let any = false
  for (let i = 0; i < index.nodes.length; i++) {
    if (levels && levels[i] === 0) continue
    box.expandByPoint(point.fromArray(index.positions, i * 3))
    any = true
  }
  if (!any) {
    const c = new THREE.Vector3(...index.center)
    return { center: c, radius: index.extent }
  }
  // Include the planes of visible layers so the layer outlines fit too.
  for (const plane of index.planes) {
    if (!index.nodes.some((n, i) => n.layer === plane.layer && (!levels || levels[i] > 0))) continue
    box.expandByPoint(point.set(plane.minX, plane.y, plane.minZ))
    box.expandByPoint(point.set(plane.maxX, plane.y, plane.maxZ))
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  return { center: sphere.center, radius: Math.max(20, sphere.radius) }
}
