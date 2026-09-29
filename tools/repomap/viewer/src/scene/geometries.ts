import * as THREE from 'three'
import type { Shape } from '../../../src/shared/types.ts'

/** Unit-sized geometries (≈ radius 1); instances are scaled by node size. Shared by every mesh. */
const factories: Record<Shape, () => THREE.BufferGeometry> = {
  sphere: () => new THREE.SphereGeometry(1, 22, 16),
  box: () => new THREE.BoxGeometry(1.5, 1.5, 1.5),
  octahedron: () => new THREE.OctahedronGeometry(1.32),
  cylinder: () => new THREE.CylinderGeometry(1.05, 1.05, 1.45, 28),
  cone: () => new THREE.ConeGeometry(0.95, 1.85, 20),
  torus: () => new THREE.TorusGeometry(0.92, 0.3, 12, 32).rotateX(Math.PI / 2),
  tetrahedron: () => new THREE.TetrahedronGeometry(1.35),
  dodecahedron: () => new THREE.DodecahedronGeometry(1.1),
  icosahedron: () => new THREE.IcosahedronGeometry(1.25),
  capsule: () => new THREE.CapsuleGeometry(0.62, 0.95, 6, 16),
  tile: () => new THREE.BoxGeometry(1.7, 0.4, 1.7),
  disc: () => new THREE.CylinderGeometry(1.2, 1.2, 0.38, 32),
}

const cache = new Map<Shape, THREE.BufferGeometry>()

export function geometryFor(shape: Shape): THREE.BufferGeometry {
  const key = factories[shape] ? shape : 'sphere'
  let geometry = cache.get(key)
  if (!geometry) {
    geometry = factories[key]()
    cache.set(key, geometry)
  }
  return geometry
}

let halo: THREE.BufferGeometry | undefined
export function haloGeometry(): THREE.BufferGeometry {
  halo ??= new THREE.SphereGeometry(1, 20, 14)
  return halo
}
