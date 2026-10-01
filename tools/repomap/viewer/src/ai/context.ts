/**
 * What the user is looking at, as context for the assistant: the selected node of the map (with what it
 * connects to), the open file and the selected lines, the selected commit, or the uncommitted changes.
 */
import type { ContextItem } from '../../../src/shared/ai.ts'
import type { LiveFile } from '../../../src/shared/git-actions.ts'
import { WORKTREE, type GitCommit } from '../../../src/shared/git-types.ts'
import type { GraphIndex } from '../model/graph.ts'

const MAX_SELECTION = 20_000

export function nodeContext(index: GraphIndex, i: number): ContextItem {
  const node = index.nodes[i]
  const kind = index.kinds.get(node.kind)?.label ?? node.kind
  const layer = index.layerById.get(node.layer)?.label ?? node.layer
  const label = (id: string) => {
    const at = index.byId.get(id)
    return at !== undefined ? `${index.nodes[at].label} (${index.kinds.get(index.nodes[at].kind)?.label ?? index.nodes[at].kind})` : id
  }
  const out = index.graph.edges.filter((e) => e.from === node.id).slice(0, 20)
  const into = index.graph.edges.filter((e) => e.to === node.id).slice(0, 20)
  const lines = [
    `${node.label} - ${kind} on the ${layer} layer (id ${node.id})`,
    node.file ? `file: ${node.file}${node.line ? `:${node.line}${node.endLine && node.endLine > node.line ? `-${node.endLine}` : ''}` : ''}` : '',
    node.description ? `description: ${node.description}` : '',
    out.length ? `uses: ${out.map((e) => `${e.type} ${label(e.to)}`).join('; ')}` : '',
    into.length ? `used by: ${into.map((e) => `${label(e.from)} ${e.type}`).join('; ')}` : '',
  ]
  return { kind: 'node', label: `${node.label} · ${kind}`, text: lines.filter(Boolean).join('\n') }
}

export function fileContext(file: string, cursorLine: number | null): ContextItem {
  return {
    kind: 'file',
    label: `${file.split('/').pop()}${cursorLine ? `:${cursorLine}` : ''}`,
    text: `The user has ${file} open in the editor${cursorLine ? `, cursor on line ${cursorLine}` : ''}.`,
  }
}

export function selectionContext(file: string, selection: { from: number; to: number; text: string }): ContextItem {
  const text = selection.text.length > MAX_SELECTION ? `${selection.text.slice(0, MAX_SELECTION)}\n… (selection cut here)` : selection.text
  const numbered = text
    .split('\n')
    .map((line, k) => `${String(selection.from + k).padStart(5)}  ${line}`)
    .join('\n')
  return {
    kind: 'selection',
    label: `${file.split('/').pop()}:${selection.from}${selection.to > selection.from ? `–${selection.to}` : ''}`,
    text: `Selected in ${file}, lines ${selection.from}-${selection.to}:\n${numbered}`,
  }
}

export function commitContext(commit: GitCommit): ContextItem {
  const files = (commit.files ?? []).slice(0, 60).map((f) => `  ${f.status} ${f.from ? `${f.from} -> ` : ''}${f.path}`)
  return {
    kind: 'commit',
    label: `${commit.hash.slice(0, 7)} ${commit.subject.length > 40 ? `${commit.subject.slice(0, 40)}…` : commit.subject}`,
    text: [
      `commit ${commit.hash}`,
      `author: ${commit.author}, ${new Date(commit.date * 1000).toISOString().slice(0, 10)}`,
      `parents: ${commit.parents.map((p) => p.slice(0, 7)).join(', ') || 'none'}`,
      '',
      commit.subject,
      commit.body ? `\n${commit.body}` : '',
      files.length ? `\nfiles:\n${files.join('\n')}` : '',
    ]
      .filter((line) => line !== undefined)
      .join('\n')
      .trim(),
  }
}

export function changesContext(files: LiveFile[], branch?: string): ContextItem {
  const code = (f: LiveFile) => (f.x === '?' ? '??' : `${f.x}${f.y}`.replace(/\./g, ' '))
  return {
    kind: 'changes',
    label: `${files.length} uncommitted ${files.length === 1 ? 'change' : 'changes'}`,
    text: `Uncommitted changes${branch ? ` on ${branch}` : ''} (git status codes):\n${files
      .slice(0, 200)
      .map((f) => `  ${code(f)} ${f.from ? `${f.from} -> ` : ''}${f.path}${f.conflicted ? ' (conflict)' : ''}`)
      .join('\n')}`,
  }
}

export interface ContextSources {
  tab: 'map' | 'git'
  index: GraphIndex | null
  selectedNode: number | null
  editor: { file: string | null; cursorLine: number | null; selection: { from: number; to: number; text: string } | null }
  selectedCommit: string | null
  commit?: GitCommit
  changes?: { files: LiveFile[]; branch?: string }
}

/** Everything worth attaching right now, most specific first. */
export function gatherContext(sources: ContextSources): ContextItem[] {
  const items: ContextItem[] = []
  const { editor } = sources
  if (editor.file) {
    if (editor.selection && editor.selection.text.trim()) items.push(selectionContext(editor.file, editor.selection))
    items.push(fileContext(editor.file, editor.cursorLine))
  }
  if (sources.tab === 'map' && sources.index && sources.selectedNode !== null && sources.index.nodes[sources.selectedNode]) {
    items.push(nodeContext(sources.index, sources.selectedNode))
  }
  if (sources.tab === 'git') {
    if (sources.selectedCommit === WORKTREE && sources.changes?.files.length) items.push(changesContext(sources.changes.files, sources.changes.branch))
    else if (sources.commit) items.push(commitContext(sources.commit))
  }
  return items
}
