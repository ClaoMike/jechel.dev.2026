import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Plane } from '../model/graph.ts'
import { useViewer } from '../model/store.ts'
import { THEMES } from './theme.ts'

const GRID_STEP = 10

/** A translucent rounded slab per layer, with a faint grid and a crisp border. */
export function Planes() {
  const index = useViewer((s) => s.index)!
  const filters = useViewer((s) => s.filters)
  const counts = useViewer((s) => s.counts)
  const themeName = useViewer((s) => s.theme)
  const invalidate = useThree((s) => s.invalidate)
  const theme = THEMES[themeName]

  useEffect(() => invalidate(), [filters, counts, themeName, invalidate])

  return (
    <group>
      {index.planes.map((plane) => {
        const level = filters.layers[plane.layer] ?? 'show'
        if (level === 'hide' || counts?.layers.get(plane.layer)?.shown === 0) return null
        const color = index.layerById.get(plane.layer)?.color ?? '#94a3b8'
        return <LayerPlane key={plane.layer} plane={plane} color={color} dim={level === 'dim'} opacity={theme.planeOpacity} gridOpacity={theme.gridOpacity} borderOpacity={theme.borderOpacity} />
      })}
    </group>
  )
}

function LayerPlane({
  plane,
  color,
  dim,
  opacity,
  gridOpacity,
  borderOpacity,
}: {
  plane: Plane
  color: string
  dim: boolean
  opacity: number
  gridOpacity: number
  borderOpacity: number
}) {
  const { fill, border, grid } = useMemo(() => {
    const width = plane.maxX - plane.minX
    const depth = plane.maxZ - plane.minZ
    const radius = Math.min(14, width / 6, depth / 6)
    const shape = roundedRect(-width / 2, -depth / 2, width, depth, radius)
    const fillGeometry = new THREE.ShapeGeometry(shape, 12)
    const borderGeometry = new THREE.BufferGeometry().setFromPoints(shape.getPoints(24))
    const lines: number[] = []
    for (let x = Math.ceil(plane.minX / GRID_STEP) * GRID_STEP; x < plane.maxX; x += GRID_STEP) {
      lines.push(x - (plane.minX + width / 2), -depth / 2 + radius / 2, 0, x - (plane.minX + width / 2), depth / 2 - radius / 2, 0)
    }
    for (let z = Math.ceil(plane.minZ / GRID_STEP) * GRID_STEP; z < plane.maxZ; z += GRID_STEP) {
      const y = z - (plane.minZ + depth / 2)
      lines.push(-width / 2 + radius / 2, y, 0, width / 2 - radius / 2, y, 0)
    }
    const gridGeometry = new THREE.BufferGeometry()
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
    return { fill: fillGeometry, border: borderGeometry, grid: gridGeometry }
  }, [plane])
  useEffect(() => () => [fill, border, grid].forEach((g) => g.dispose()), [fill, border, grid])

  const factor = dim ? 0.35 : 1
  const cx = (plane.minX + plane.maxX) / 2
  const cz = (plane.minZ + plane.maxZ) / 2
  // Flat on the XZ plane; the shape's y axis maps to +z (so minZ is the far edge).
  return (
    <group position={[cx, plane.y - 0.4, cz]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
      <mesh geometry={fill} renderOrder={-2}>
        <meshBasicMaterial color={color} transparent opacity={opacity * factor} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={grid} renderOrder={-1}>
        <lineBasicMaterial color={color} transparent opacity={gridOpacity * factor} depthWrite={false} />
      </lineSegments>
      <lineLoop geometry={border} renderOrder={-1}>
        <lineBasicMaterial color={color} transparent opacity={borderOpacity * factor} depthWrite={false} />
      </lineLoop>
    </group>
  )
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
}
