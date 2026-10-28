/** Where two wires of a laid-out board run on top of each other: shared stretches of the same line. */
import type { BoardLayout, Point } from './layout.ts'

export interface Overlap {
  a: string
  b: string
  length: number
}

/** Stretches where two wires share a line for more than `min` pixels (crossings don't count). */
export function overlaps(layout: BoardLayout, min = 2, tolerance = 1.5): Overlap[] {
  const segments: { wire: string; horizontal: boolean; at: number; from: number; to: number }[] = []
  for (const [wire, points] of layout.wires) {
    for (let k = 1; k < points.length; k++) {
      const p: Point = points[k - 1]
      const q: Point = points[k]
      if (Math.abs(p.y - q.y) < 0.5) segments.push({ wire, horizontal: true, at: p.y, from: Math.min(p.x, q.x), to: Math.max(p.x, q.x) })
      else if (Math.abs(p.x - q.x) < 0.5) segments.push({ wire, horizontal: false, at: p.x, from: Math.min(p.y, q.y), to: Math.max(p.y, q.y) })
    }
  }
  const found = new Map<string, Overlap>()
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i]
      const t = segments[j]
      if (s.wire === t.wire || s.horizontal !== t.horizontal || Math.abs(s.at - t.at) > tolerance) continue
      const length = Math.min(s.to, t.to) - Math.max(s.from, t.from)
      if (length <= min) continue
      const key = s.wire < t.wire ? `${s.wire}\n${t.wire}` : `${t.wire}\n${s.wire}`
      const existing = found.get(key)
      if (existing) existing.length += length
      else found.set(key, { a: s.wire < t.wire ? s.wire : t.wire, b: s.wire < t.wire ? t.wire : s.wire, length })
    }
  }
  return [...found.values()]
}

/** Nearest first, either way: 6, -6, 12, -12 … up to 120 pixels. */
const SHIFTS = Array.from({ length: 40 }, (_, k) => (k % 2 ? -1 : 1) * 6 * (Math.floor(k / 2) + 1))

/**
 * The last few shared stretches ELK leaves (two wires attached at nearly the same height on different chips): slides
 * a wire's inner bend sideways, keeping it orthogonal, when that clears the overlap without going through a chip or
 * making another one. Changes `layout` in place; returns how many overlaps are left.
 */
export function nudge(layout: BoardLayout, tolerance = 1.5): number {
  let found = overlaps(layout, 2, tolerance)
  for (let round = 0; round < 20 && found.length > 0; round++) {
    let improved = false
    for (const { a, b } of found) {
      for (const wire of [b, a]) {
        if (tryShift(layout, wire, found.length, tolerance)) {
          improved = true
          break
        }
      }
      if (improved) break
    }
    if (!improved) break
    found = overlaps(layout, 2, tolerance)
  }
  return found.length
}

function tryShift(layout: BoardLayout, wire: string, before: number, tolerance: number): boolean {
  const points = layout.wires.get(wire)!
  // Inner segments only: both ends are bends, so the segments next to it stretch or shrink and stay orthogonal.
  for (let i = 1; i + 2 < points.length; i++) {
    const vertical = Math.abs(points[i].x - points[i + 1].x) < 0.5
    for (const d of SHIFTS) {
      const moved = points.map((p) => ({ ...p }))
      if (vertical) {
        moved[i].x += d
        moved[i + 1].x += d
      } else {
        moved[i].y += d
        moved[i + 1].y += d
      }
      if (throughChip(layout, moved.slice(i - 1, i + 3))) continue
      layout.wires.set(wire, moved)
      if (overlaps(layout, 2, tolerance).length < before) return true
      layout.wires.set(wire, points)
    }
  }
  return false
}

function throughChip(layout: BoardLayout, points: Point[]): boolean {
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1]
    const q = points[k]
    for (const box of layout.chips.values()) {
      const x0 = Math.min(p.x, q.x)
      const x1 = Math.max(p.x, q.x)
      const y0 = Math.min(p.y, q.y)
      const y1 = Math.max(p.y, q.y)
      if (x1 > box.x + 1 && x0 < box.x + box.w - 1 && y1 > box.y + 1 && y0 < box.y + box.h - 1) return true
    }
  }
  return false
}
