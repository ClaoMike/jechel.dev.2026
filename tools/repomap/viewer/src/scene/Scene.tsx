import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useViewer } from '../model/store.ts'
import { CameraRig } from './CameraRig.tsx'
import { Edges } from './Edges.tsx'
import { Labels, overlay } from './Labels.tsx'
import { Nodes } from './Nodes.tsx'
import { Planes } from './Planes.tsx'
import { pick, projection } from './projection.ts'

/** Redraw on demand whenever the store changes something the scene shows. */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  const version = useViewer((s) => s.version)
  const hovered = useViewer((s) => s.hovered)
  const tab = useViewer((s) => s.tab)
  useEffect(() => invalidate(), [version, hovered, tab, invalidate])
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

const LONG_PRESS_MS = 520
const DOUBLE_TAP_MS = 320

interface Press {
  x: number
  y: number
  button: number
  ctrl: boolean
  touch: boolean
  moved: boolean
  /** A long-press opened the menu: don't treat the release as a tap. */
  long: boolean
  timer?: ReturnType<typeof setTimeout>
}

/**
 * Pointer handling on top of the camera controls:
 * - mouse: click selects, right-click / Ctrl+click opens the node menu, double-click flies to a node
 * - touch: tap selects, double-tap flies, long-press opens the node menu
 * Drags (and multi-finger gestures) belong to the camera and never select.
 */
export function Scene() {
  const index = useViewer((s) => s.index)
  const hovered = useViewer((s) => s.hovered)
  const container = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLCanvasElement>(null)
  const press = useRef<Press | null>(null)
  const pointers = useRef(new Set<number>())
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null)
  const lastClick = useRef(0)
  const frame = useRef(0)

  useEffect(() => {
    overlay.canvas = labels.current
    // Test hook (automation only): where a node is on screen, so tests can click real nodes.
    if (navigator.webdriver) {
      ;(window as unknown as { __repomapTest: unknown }).__repomapTest = {
        screenPosition: (id: string) => {
          const i = useViewer.getState().index?.byId.get(id)
          if (i === undefined || i >= projection.count) return null
          const rect = container.current!.getBoundingClientRect()
          return { x: rect.left + projection.x[i], y: rect.top + projection.y[i], radius: projection.r[i] }
        },
      }
    }
    return () => {
      overlay.canvas = null
    }
  }, [])

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = container.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const cancelPress = () => {
    if (press.current?.timer) clearTimeout(press.current.timer)
    press.current = null
  }

  const onPointerDown = (event: ReactPointerEvent) => {
    useViewer.getState().markInteracted()
    pointers.current.add(event.pointerId)
    if (pointers.current.size > 1) {
      // Pinch / two-finger pan: a camera gesture, not a tap.
      cancelPress()
      return
    }
    const { x, y } = local(event)
    const touch = event.pointerType !== 'mouse'
    const current: Press = { x, y, button: event.button, ctrl: event.ctrlKey, touch, moved: false, long: false }
    if (touch) {
      current.timer = setTimeout(() => {
        if (press.current !== current || current.moved) return
        const hit = pick(x, y, 14)
        if (hit === null) return
        current.long = true
        navigator.vibrate?.(12)
        useViewer.getState().openContextMenu(hit, x, y)
      }, LONG_PRESS_MS)
    }
    press.current = current
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const { x, y } = local(event)
    const current = press.current
    if (current && !current.moved && Math.hypot(x - current.x, y - current.y) > (current.touch ? 10 : 5)) {
      current.moved = true
      if (current.timer) clearTimeout(current.timer)
    }
    // Hover only exists for mice; ignore while a button is held (rotating/panning).
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => useViewer.getState().hover(pick(x, y)))
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
    const current = press.current
    cancelPress()
    if (!current || current.moved || current.long) return
    const { x, y } = local(event)
    const store = useViewer.getState()
    const slack = current.touch ? 14 : 6
    if (current.button === 2 || (current.button === 0 && current.ctrl)) {
      const hit = pick(x, y, slack)
      if (hit !== null) store.openContextMenu(hit, x, y)
      return
    }
    if (current.button !== 0) return
    const hit = pick(x, y, slack)
    if (current.touch) {
      const now = performance.now()
      const previous = lastTap.current
      if (previous && now - previous.time < DOUBLE_TAP_MS && Math.hypot(previous.x - x, previous.y - y) < 28) {
        lastTap.current = null
        if (hit !== null) store.select(hit, true)
        else store.command({ type: 'fit' })
        return
      }
      lastTap.current = { time: now, x, y }
      if (store.hovered !== null) store.hover(null)
    }
    if (hit === null) {
      if (store.selected !== null) store.select(null)
    } else {
      // Clicking the selected node again clears it (but not the second click of a double-click).
      const quickSecond = !current.touch && performance.now() - lastClick.current < 350
      store.select(hit === store.selected && !current.touch && !quickSecond ? null : hit)
    }
    if (!current.touch) lastClick.current = performance.now()
  }

  const onPointerCancel = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
    cancelPress()
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    // Touch double-taps are handled in onPointerUp.
    if (lastTap.current || (event.nativeEvent as PointerEvent).pointerType === 'touch') return
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
