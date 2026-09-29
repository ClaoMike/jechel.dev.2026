import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useViewer } from '../model/store.ts'
import { CameraRig } from './CameraRig.tsx'
import { Edges } from './Edges.tsx'
import { Labels, overlay } from './Labels.tsx'
import { Nodes } from './Nodes.tsx'
import { Planes } from './Planes.tsx'
import { pick } from './projection.ts'

/** Redraw on demand whenever the store changes something the scene shows. */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  const version = useViewer((s) => s.version)
  const hovered = useViewer((s) => s.hovered)
  useEffect(() => invalidate(), [version, hovered, invalidate])
  return null
}

function Lights() {
  const theme = useViewer((s) => s.theme)
  return (
    <>
      <ambientLight intensity={theme === 'dark' ? 0.75 : 1.05} />
      <hemisphereLight args={['#dbeafe', '#1e293b', theme === 'dark' ? 0.55 : 0.4]} />
      <directionalLight position={[120, 260, 180]} intensity={1.35} />
      <directionalLight position={[-160, 80, -120]} intensity={0.35} />
    </>
  )
}

export function Scene() {
  const index = useViewer((s) => s.index)
  const hovered = useViewer((s) => s.hovered)
  const container = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLCanvasElement>(null)
  const down = useRef<{ x: number; y: number; time: number } | null>(null)
  const frame = useRef(0)

  useEffect(() => {
    overlay.canvas = labels.current
    return () => {
      overlay.canvas = null
    }
  }, [])

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = container.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    if (down.current && (event.buttons & 1 || event.buttons & 2)) return
    const { x, y } = local(event)
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => useViewer.getState().hover(pick(x, y)))
  }

  const onPointerDown = (event: ReactPointerEvent) => {
    const { x, y } = local(event)
    down.current = { x, y, time: performance.now() }
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    const start = down.current
    down.current = null
    if (!start || event.button !== 0) return
    const { x, y } = local(event)
    if (Math.hypot(x - start.x, y - start.y) > 5) return // it was a drag
    const hit = pick(x, y)
    const store = useViewer.getState()
    if (hit === null) {
      if (store.selected !== null) store.select(null)
    } else {
      store.select(hit === store.selected && event.detail < 2 ? null : hit)
    }
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    const { x, y } = local(event)
    const hit = pick(x, y)
    if (hit !== null) useViewer.getState().select(hit, true)
    else useViewer.getState().command({ type: 'fit' })
  }

  return (
    <div
      ref={container}
      className="scene"
      style={{ cursor: hovered !== null ? 'pointer' : 'grab' }}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => useViewer.getState().hover(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="scene"
    >
      {index && (
        <Canvas
          frameloop="demand"
          flat
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
          camera={{ fov: 42, near: 0.5, far: 60000, position: [320, 260, 420] }}
        >
          <Invalidator />
          <Lights />
          <CameraRig />
          <Planes />
          <Edges />
          <Nodes />
          <Labels />
        </Canvas>
      )}
      <canvas ref={labels} className="labels" />
    </div>
  )
}
