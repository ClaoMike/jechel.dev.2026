/**
 * Viewer state (zustand): the graph, the tab on show, the theme, the code panel and the messages; the Board and the
 * history keep their own state (board/store.ts, git/store.ts).
 */
import { create } from 'zustand'
import type { GraphNode, RepoGraph } from '../../../src/shared/types.ts'
import { indexGraph, type GraphIndex } from './graph.ts'
import { readHashParam, readPref, writeHashParams, writePref } from './url.ts'

export type Theme = 'dark' | 'light'
export type Tab = 'board' | 'git'

export interface GraphSource {
  kind: 'server' | 'url' | 'file' | 'demo'
  name: string
}

interface State {
  /** The Board or the git history. */
  tab: Tab
  graph: RepoGraph | null
  index: GraphIndex | null
  source: GraphSource | null
  loading: boolean
  error: string | null
  theme: Theme
  helpOpen: boolean
  /** Narrow screens: the history's menu sheet. */
  viewMenuOpen: boolean
  toast: { text: string; nonce: number } | null
  /**
   * The file open in the code panel, and the node it was opened from (null when a rebuild removed
   * it, e.g. after renaming it in the editor: the panel stays open on the file).
   */
  codeView: { node: number | null; opened: GraphNode } | null
  /** A file just created or renamed: shown on the Board once a rebuild brings it in. */
  pendingReveal: string | null
  /** The last file revealed (the Board opens on it). */
  revealed: { node: number; nonce: number } | null
}

interface Actions {
  setTab(tab: Tab): void
  /** `keepView`: a rebuild of the same repository (the code panel stays on its file). */
  setGraph(graph: RepoGraph, source: GraphSource, keepView?: boolean): void
  setLoading(loading: boolean): void
  setError(error: string | null): void
  setTheme(value: Theme): void
  setHelp(open: boolean): void
  setViewMenu(open: boolean): void
  notify(text: string): void
  openCode(node: number): void
  /** Opens a file in the code panel, whether or not the graph has a node for it yet. */
  openFile(path: string): void
  closeCode(): void
  revealFile(path: string | null): void
}

function initialTheme(): Theme {
  const stored = readPref<'dark' | 'light' | 'auto'>('theme', 'auto')
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const useViewer = create<State & Actions>((set, get) => ({
  tab: readHashParam('tab') === 'git' ? 'git' : 'board',
  graph: null,
  index: null,
  source: null,
  loading: true,
  error: null,
  theme: initialTheme(),
  helpOpen: false,
  viewMenuOpen: false,
  toast: null,
  codeView: null,
  pendingReveal: null,
  revealed: null,

  setTab(tab) {
    if (get().tab === tab) return
    set({ tab, viewMenuOpen: false, helpOpen: false })
    writeHashParams({ tab: tab === 'board' ? null : tab })
  },

  setGraph(graph, source, keepView) {
    const index = indexGraph(graph)
    const previous = get()
    set({
      codeView:
        keepView && previous.codeView
          ? { node: index.byId.get(previous.codeView.opened.id) ?? nodeForFile(index, previous.codeView.opened.file!) ?? null, opened: previous.codeView.opened }
          : null,
      graph,
      index,
      source,
      loading: false,
      error: null,
    })
    // A file created or renamed from here: show where it landed.
    const reveal = get().pendingReveal
    const found = reveal ? nodeForFile(index, reveal) : undefined
    if (reveal && found !== undefined) {
      set({ pendingReveal: null, revealed: { node: found, nonce: Date.now() } })
      const layer = index.layerById.get(index.nodes[found].layer)?.label
      get().notify(`${reveal.split('/').pop()} is on the board${layer ? ` (${layer})` : ''}`)
    }
  },

  setLoading(loading) {
    set({ loading })
  },

  setError(error) {
    set({ error, loading: false })
  },

  setTheme(value) {
    writePref('theme', value)
    set({ theme: value })
  },

  setHelp(open) {
    set({ helpOpen: open })
  },

  setViewMenu(open) {
    set({ viewMenuOpen: open })
  },

  notify(text) {
    set({ toast: { text, nonce: Date.now() } })
  },

  openCode(node) {
    const opened = get().index?.nodes[node]
    if (opened?.file) set({ codeView: { node, opened } })
  },

  openFile(path) {
    const index = get().index
    const node = index ? nodeForFile(index, path) : undefined
    if (node !== undefined) {
      get().openCode(node)
      return
    }
    const name = path.split('/').pop() ?? path
    // Not in the graph (yet): a stand-in node, replaced when a rebuild brings the file in.
    const opened: GraphNode = { id: `file:${path}`, label: name, kind: 'file', layer: '', role: '', file: path }
    set({ codeView: { node: null, opened } })
  },

  revealFile(path) {
    set({ pendingReveal: path })
  },

  closeCode() {
    if (get().codeView) set({ codeView: null })
  },
}))

/** The node that stands for a file: its file node, else its outermost declaration. */
export function nodeForFile(index: GraphIndex, path: string): number | undefined {
  let best: number | undefined
  index.nodes.forEach((node, i) => {
    if (node.file !== path) return
    if (node.id.includes(':file:')) {
      best = i
      return
    }
    if (best !== undefined && index.nodes[best].id.includes(':file:')) return
    const parent = node.parent ? index.byId.get(node.parent) : undefined
    const outermost = parent === undefined || index.nodes[parent].file !== path
    if (best === undefined || (outermost && (index.nodes[best].line ?? Infinity) > (node.line ?? Infinity))) best = i
  })
  return best
}
