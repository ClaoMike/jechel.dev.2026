import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useViewer } from '../model/store.ts'
import { Icon, ShapeIcon } from './icons.tsx'

/** The menu opened by right-click (or long-press on touch screens) on a node. */
export function ContextMenu() {
  const menu = useViewer((s) => s.contextMenu)
  const index = useViewer((s) => s.index)
  const close = useViewer((s) => s.closeContextMenu)
  const openCode = useViewer((s) => s.openCode)
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  // Keep the menu inside the stage.
  useLayoutEffect(() => {
    const element = ref.current
    if (!menu || !element) {
      setPosition(null)
      return
    }
    const parent = element.parentElement!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const left = Math.max(8, Math.min(menu.x, parent.width - box.width - 8))
    const top = menu.y + box.height + 8 > parent.height ? Math.max(8, menu.y - box.height) : menu.y
    setPosition({ left, top })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }
    const dismiss = () => close()
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('wheel', dismiss, { passive: true })
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('wheel', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
    }
  }, [menu, close])

  if (!menu || !index) return null
  const node = index.nodes[menu.node]
  if (!node) return null
  const kind = index.kinds.get(node.kind)
  const location = node.file ? `${node.file.split('/').pop()}${node.line ? `:${node.line}` : ''}` : null
  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={`Actions for ${node.label}`}
      style={position ? { left: position.left, top: position.top } : { left: menu.x, top: menu.y, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="context-menu"
    >
      <div className="context-title">
        {kind && <ShapeIcon shape={kind.shape} color={kind.color} size={13} />}
        <span className="context-label">{node.label}</span>
        {kind && <span className="context-kind">{kind.label}</span>}
      </div>
      <button
        type="button"
        role="menuitem"
        className="context-item"
        disabled={!node.file}
        title={node.file ? `Show ${node.file}` : 'This node has no source file'}
        onClick={() => openCode(menu.node)}
      >
        <Icon name="code" size={15} />
        <span>View code</span>
        {location && <span className="context-hint">{location}</span>}
      </button>
    </div>
  )
}
