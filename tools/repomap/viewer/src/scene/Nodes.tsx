import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Shape } from '../../../src/shared/types.ts'
import { mix, nodeRgb, type RGB } from '../model/colors.ts'
import { useViewer } from '../model/store.ts'
import { geometryFor, haloGeometry } from './geometries.ts'
import { THEMES } from './theme.ts'

interface Group {
  key: string
  shape: Shape
  ghost: boolean
  indices: number[]
}

const WHITE: RGB = [1, 1, 1]
const CHANGE: RGB = [0.29, 0.87, 0.5]
const MAX_HALOS = 4000

/** One instanced mesh per (shape, style): a few draw calls for thousands of nodes. */
export function Nodes() {
  const index = useViewer((s) => s.index)!
  const visibility = useViewer((s) => s.visibility)
  const trace = useViewer((s) => s.trace)
  const selected = useViewer((s) => s.selected)
  const hovered = useViewer((s) => s.hovered)
  const colorBy = useViewer((s) => s.colorBy)
  const themeName = useViewer((s) => s.theme)
  const showChanges = useViewer((s) => s.showChanges)
  const invalidate = useThree((s) => s.invalidate)

  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    index.nodes.forEach((node, i) => {
      const shape = index.kinds.get(node.kind)?.shape ?? 'sphere'
      const ghost = (index.roleChain.get(node.role) ?? []).some((r) => index.roles.get(r)?.style === 'ghost')
      const key = `${shape}|${ghost ? 'ghost' : 'solid'}`
      if (!map.has(key)) map.set(key, { key, shape, ghost, indices: [] })
      map.get(key)!.indices.push(i)
    })
    return [...map.values()]
  }, [index])

  const materials = useMemo(
    () =>
      groups.map(
        (group) =>
          new THREE.MeshStandardMaterial({
            roughness: 0.48,
            metalness: 0.08,
            transparent: group.ghost,
            opacity: group.ghost ? 0.4 : 1,
            depthWrite: !group.ghost,
          }),
      ),
    [groups],
  )
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])

  useLayoutEffect(() => {
    const theme = THEMES[themeName]
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scaleVector = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const color = new THREE.Color()
    groups.forEach((group, g) => {
      const mesh = meshes.current[g]
      if (!mesh) return
      group.indices.forEach((i, k) => {
        const level = visibility?.nodes[i] ?? 2
        let scale = index.radius[i]
        let rgb = nodeRgb(index, i, colorBy)
        if (level === 0) {
          scale = 0
        } else if (trace) {
          const member = trace.nodes.get(i)
          if (!member) {
            rgb = mix(rgb, theme.fade, level === 1 ? 0.92 : 0.82)
            scale *= 0.8
          } else if (member.role === 'root') {
            scale *= 1.25
            rgb = mix(rgb, WHITE, 0.1)
          } else if (level === 1) {
            rgb = mix(rgb, theme.fade, 0.5)
          }
        } else if (level === 1) {
          rgb = mix(rgb, theme.fade, 0.78)
          scale *= 0.85
        }
        if (i === hovered && level > 0) scale *= 1.12
        position.set(index.positions[i * 3], index.positions[i * 3 + 1], index.positions[i * 3 + 2])
        scaleVector.setScalar(scale)
        matrix.compose(position, rotation, scaleVector)
        mesh.setMatrixAt(k, matrix)
        color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace)
        mesh.setColorAt(k, color)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
    invalidate()
  }, [groups, index, visibility, trace, hovered, colorBy, themeName, invalidate])

  return (
    <group>
      {groups.map((group, g) => (
        <instancedMesh
          key={`${group.key}-${index.nodes.length}`}
          ref={(mesh) => {
            meshes.current[g] = mesh
          }}
          args={[geometryFor(group.shape), materials[g], group.indices.length]}
          frustumCulled={false}
        />
      ))}
      <Halos selected={selected} hovered={hovered} showChanges={showChanges} />
    </group>
  )
}

/** Soft glow around the selection, hovered node, trace members and nodes added since the last build. */
function Halos({ selected, hovered, showChanges }: { selected: number | null; hovered: number | null; showChanges: boolean }) {
  const index = useViewer((s) => s.index)!
  const visibility = useViewer((s) => s.visibility)
  const trace = useViewer((s) => s.trace)
  const colorBy = useViewer((s) => s.colorBy)
  const themeName = useViewer((s) => s.theme)
  const invalidate = useThree((s) => s.invalidate)
  const mesh = useRef<THREE.InstancedMesh>(null)

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: themeName === 'dark' ? 0.2 : 0.16,
        blending: themeName === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
      }),
    [themeName],
  )
  useEffect(() => () => material.dispose(), [material])

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const color = new THREE.Color()
    let count = 0
    const add = (i: number, factor: number, rgb: RGB) => {
      if (count >= MAX_HALOS || (visibility && visibility.nodes[i] === 0)) return
      position.set(index.positions[i * 3], index.positions[i * 3 + 1], index.positions[i * 3 + 2])
      scale.setScalar(index.radius[i] * factor)
      matrix.compose(position, rotation, scale)
      target.setMatrixAt(count, matrix)
      color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace)
      target.setColorAt(count, color)
      count++
    }
    if (showChanges) for (const i of index.added) add(i, 2.3, CHANGE)
    if (trace && trace.nodes.size < 1500) {
      for (const [i, member] of trace.nodes) if (member.role !== 'ancestor' && i !== selected) add(i, 1.75, nodeRgb(index, i, colorBy))
    }
    if (hovered !== null) add(hovered, 1.9, mix(nodeRgb(index, hovered, colorBy), WHITE, 0.3))
    if (selected !== null) add(selected, 2.4, mix(nodeRgb(index, selected, colorBy), WHITE, 0.45))
    target.count = count
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
    invalidate()
  }, [index, visibility, trace, selected, hovered, showChanges, colorBy, material, invalidate])

  return <instancedMesh ref={mesh} args={[haloGeometry(), material, MAX_HALOS]} frustumCulled={false} renderOrder={2} />
}
