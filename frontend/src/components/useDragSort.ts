import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { strings } from '../strings'

type Drag = { from: number; to: number }

/**
 * Reorder a list by dragging: with a mouse or pen anywhere on an item, by touch on its handle
 * (so the page can still scroll), and with the arrow keys on the handle. While dragging, the
 * list shows the new order; it's applied with `onMove(from, to)` when the item is dropped.
 *
 * Give each item `itemProps(position)` (the items must be the list's children) and its handle `handleProps(position, name)`, and render
 * `order`: the original index of the item shown at each position.
 */
export function useDragSort(count: number, onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const dragRef = useRef<Drag | null>(null)
  const pointer = useRef<{ index: number; x: number; y: number; id: number; moving: boolean } | null>(null)

  const original = Array.from({ length: count }, (_, i) => i)
  const order = drag ? reorder(original, drag.from, drag.to) : original

  const update = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }

  // The position of the item of `list` under the pointer, from the data-sort-index on each item.
  const positionAt = (list: Element | null, x: number, y: number) => {
    const element = document.elementsFromPoint?.(x, y).find((e): e is HTMLElement => e instanceof HTMLElement && e.dataset.sortIndex !== undefined && e.parentElement === list)
    return element ? Number(element.dataset.sortIndex) : null
  }

  const finish = (drop: boolean) => {
    const current = dragRef.current
    pointer.current = null
    update(null)
    if (drop && current && current.from !== current.to) onMove(current.from, current.to)
  }

  const itemProps = (position: number) => ({
    'data-sort-index': position,
    'data-dragging': drag !== null && position === drag.to ? true : undefined,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const target = event.target as HTMLElement
      // Not from a control in the item (a switch too: its labels, its thumb, the fieldset around them).
      if (event.button !== 0 || target.closest('button:not([data-drag-handle]), a, input, textarea, select, label, fieldset')) return
      if (event.pointerType === 'touch' && !target.closest('[data-drag-handle]')) return
      pointer.current = { index: position, x: event.clientX, y: event.clientY, id: event.pointerId, moving: false }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = pointer.current
      if (!start || start.id !== event.pointerId) return
      if (!start.moving) {
        // A few pixels first, so a plain click isn't a drag.
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return
        start.moving = true
        update({ from: start.index, to: start.index })
      }
      event.preventDefault()
      const over = positionAt(event.currentTarget.parentElement, event.clientX, event.clientY)
      if (over !== null && dragRef.current && over !== dragRef.current.to) update({ ...dragRef.current, to: over })
    },
    // Only the pointer that started it ends it: another finger lifting doesn't drop the item.
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (!pointer.current || pointer.current.id === event.pointerId) finish(true)
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (!pointer.current || pointer.current.id === event.pointerId) finish(false)
    },
  })

  const handleProps = (position: number, name: string) => ({
    'data-drag-handle': true,
    'aria-label': strings.useDragSort.reorder(name),
    title: strings.useDragSort.dragReorderUseArrow,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key]
      if (step === undefined) return
      event.preventDefault()
      const to = position + step
      if (to < 0 || to >= count) return
      onMove(position, to)
      setAnnouncement(strings.useDragSort.movedPosition(to + 1, count))
    },
  })

  return { order, dragging: drag !== null, itemProps, handleProps, announcement }
}

function reorder(items: number[], from: number, to: number): number[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
