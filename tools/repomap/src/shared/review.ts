/**
 * Review mode: a diff (a branch against its base, a commit, or the uncommitted changes), the nodes it
 * touches (by changed lines), and what depends on them. Isomorphic.
 */
import type { GraphNode } from './types.ts'

export const WORKTREE = 'WORKTREE'

export interface ReviewFile {
  path: string
  /** Before a rename. */
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  added: number
  removed: number
  /** Changed lines on the new side, as [first, last]; a deletion is a one-line range where it was. */
  ranges: [number, number][]
}

export interface ReviewDiff {
  base: string
  head: string
  /** "feature/x against develop", "Uncommitted changes"… */
  label: string
  files: ReviewFile[]
  /** The unified diff (3 lines of context), cut at `patchLimit` characters; for the AI briefing. */
  patch?: string
  truncated?: boolean
}

/**
 * The nodes a diff touches: in each changed file, the innermost nodes whose lines overlap a change;
 * a file whose changes miss every node (imports, a deleted file) touches its top-level nodes.
 */
export function touchedNodes(nodes: GraphNode[], files: ReviewFile[]): Map<string, 'lines' | 'file'> {
  const byFile = new Map<string, GraphNode[]>()
  for (const node of nodes) if (node.file) (byFile.get(node.file) ?? byFile.set(node.file, []).get(node.file)!).push(node)
  const touched = new Map<string, 'lines' | 'file'>()
  for (const file of files) {
    const inFile = byFile.get(file.path) ?? (file.oldPath ? byFile.get(file.oldPath) : undefined) ?? []
    if (inFile.length === 0) continue
    if (file.status === 'added' || file.status === 'deleted') {
      for (const node of inFile) touched.set(node.id, 'file')
      continue
    }
    const spans = inFile.filter((n) => n.line !== undefined).map((n) => ({ node: n, start: n.line!, end: n.endLine ?? n.line! }))
    let hit = false
    for (const [first, last] of file.ranges) {
      const overlapping = spans.filter((s) => s.start <= last && s.end >= first)
      // Innermost: no other overlapping span lies inside it.
      for (const span of overlapping) {
        const inner = overlapping.some((o) => o !== span && o.start >= span.start && o.end <= span.end && (o.start !== span.start || o.end !== span.end))
        if (!inner) {
          touched.set(span.node.id, 'lines')
          hit = true
        }
      }
    }
    if (!hit) for (const node of inFile) if (!node.parent) touched.set(node.id, 'file')
  }
  return touched
}

/** Parses `git diff --unified=0` (or any unified diff) into files and changed line ranges. */
export function parseUnifiedDiff(text: string): ReviewFile[] {
  const files: ReviewFile[] = []
  let current: ReviewFile | undefined
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
      current = { path: match?.[2] ?? '', status: 'modified', added: 0, removed: 0, ranges: [] }
      if (match && match[1] !== match[2]) current.oldPath = match[1]
      files.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('new file mode')) current.status = 'added'
    else if (line.startsWith('deleted file mode')) current.status = 'deleted'
    else if (line.startsWith('rename from ')) {
      current.status = 'renamed'
      current.oldPath = line.slice('rename from '.length)
    } else if (line.startsWith('rename to ')) current.path = line.slice('rename to '.length)
    else if (line.startsWith('+++ b/')) current.path = line.slice(6)
    else if (line.startsWith('@@')) {
      const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
      if (!hunk) continue
      const start = Number(hunk[2])
      const count = hunk[3] === undefined ? 1 : Number(hunk[3])
      current.ranges.push(count === 0 ? [Math.max(1, start), Math.max(1, start)] : [start, start + count - 1])
    } else if (line.startsWith('+') && !line.startsWith('+++')) current.added++
    else if (line.startsWith('-') && !line.startsWith('---')) current.removed++
  }
  return files.filter((f) => f.path)
}
