/** Immutable helpers for the editable lists. */

export function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function replaceAt<T>(items: T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing))
}

export function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, i) => i !== index)
}

/**
 * Newest first by end date: ongoing entries (no end) on top, then the latest end. Entries that
 * end together go by start, latest first. Stable, so ties keep their order.
 */
export function sortByEndDate<T extends { start: string; end: string | null }>(items: T[]): T[] {
  const end = (item: T) => item.end ?? '9999-12-01'
  return [...items].sort((a, b) => end(b).localeCompare(end(a)) || b.start.localeCompare(a.start))
}

/** Newest year first; entries from the same year keep their order. */
export function sortByYear<T extends { year: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.year - a.year)
}
