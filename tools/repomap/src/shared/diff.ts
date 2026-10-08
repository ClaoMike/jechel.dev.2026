/**
 * A unified diff of two versions of a file, for showing the assistant's edits. One hunk around the
 * changed region (edits the assistant makes are one region each: a replace, an insert, a rewrite).
 */
export function unifiedDiff(before: string, after: string, path: string, context = 3): string {
  if (before === after) return ''
  const a = before === '' ? [] : before.replace(/\n$/, '').split('\n')
  const b = after === '' ? [] : after.replace(/\n$/, '').split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const from = Math.max(0, start - context)
  const toA = Math.min(a.length, endA + context)
  const toB = Math.min(b.length, endB + context)
  const lines = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${a.length === 0 ? 0 : from + 1},${toA - from} +${b.length === 0 ? 0 : from + 1},${toB - from} @@`,
    ...a.slice(from, start).map((line) => ` ${line}`),
    ...a.slice(start, endA).map((line) => `-${line}`),
    ...b.slice(start, endB).map((line) => `+${line}`),
    ...a.slice(endA, toA).map((line) => ` ${line}`),
  ]
  return lines.join('\n')
}

/** "+3 −1" counts of a diff made by unifiedDiff. */
export function diffStats(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++
    else if (line.startsWith('-') && !line.startsWith('---')) removed++
  }
  return { added, removed }
}
