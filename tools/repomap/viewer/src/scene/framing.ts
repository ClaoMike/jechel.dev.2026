import * as THREE from 'three'

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
