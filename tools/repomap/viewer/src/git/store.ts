/**
 * History tab state (zustand), separate from the map's store. The model (visible rows, lanes,
 * badges) is rebuilt when the history or the ref filters change; search matches when the query or
 * the file filter do.
 */
import { create } from 'zustand'
import { WORKTREE, type GitHistory } from '../../../src/shared/git-types.ts'
import { matches as mediaMatches, NARROW } from '../model/media.ts'
import { readHashParam, writeHashParams } from '../model/url.ts'
import { buildGitModel, DEFAULT_FILTERS, findMatches, refKey, type GitFilters, type GitModel } from './model.ts'

export interface GitSource {
  kind: 'server' | 'url' | 'file' | 'demo'
  name: string
}

interface State {
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error'
  /** Why the history is missing or failed to load. */
  message: string | null
  history: GitHistory | null
  source: GitSource | null
  model: GitModel | null
  filters: GitFilters
  query: string
  /** "History of this file": only commits that changed it are bright. */
  path: string | null
  /** Matching rows, newest first (null: no search). */
  matches: number[] | null
  matchFlags: Uint8Array | null
  /** Selected commit hash, or WORKTREE. */
  selected: string | null
  /** The branches & pull requests panel. */
  panelOpen: boolean
  /** Narrow screens: the details sheet is pulled up. */
  sheetExpanded: boolean
  /** Narrow screens: the search field is expanded over the top bar. */
  searchExpanded: boolean
  scroll: { row: number; nonce: number } | null
}

interface Actions {
  setLoading(): void
  setMissing(message: string): void
  setError(message: string): void
  setHistory(history: GitHistory, source: GitSource, keep?: boolean): void
  select(hash: string | null, scroll?: boolean): void
  move(delta: number): void
  selectEdge(edge: 'first' | 'last'): void
  jumpToHead(): void
  setQuery(query: string): void
  setPath(path: string | null): void
  step(direction: 1 | -1): void
  setFilters(filters: Partial<GitFilters>): void
  toggleRef(key: string): void
  soloRef(key: string): void
  resetFilters(): void
  togglePanel(): void
  setPanel(open: boolean): void
  setSheetExpanded(expanded: boolean): void
  setSearchExpanded(expanded: boolean): void
}

export const useGit = create<State & Actions>((set, get) => {
  const rematch = (model: GitModel | null, query: string, path: string | null) => {
    const found = model ? findMatches(model, query, path) : null
    let flags: Uint8Array | null = null
    if (found && model) {
      flags = new Uint8Array(model.rows.length)
      for (const row of found) flags[row] = 1
    }
    return { matches: found, matchFlags: flags }
  }

  const rebuild = (filters: GitFilters) => {
    const { history, query, path, selected } = get()
    if (!history) return set({ filters })
    const model = buildGitModel(history, filters)
    set({ filters, model, ...rematch(model, query, path), selected: selected && model.rowOf.has(selected) ? selected : null })
  }

  const requestScroll = (row: number) => set({ scroll: { row, nonce: Date.now() + Math.random() } })

  return {
    status: 'idle',
    message: null,
    history: null,
    source: null,
    model: null,
    filters: DEFAULT_FILTERS,
    query: '',
    path: null,
    matches: null,
    matchFlags: null,
    selected: null,
    panelOpen: !mediaMatches(NARROW),
    sheetExpanded: false,
    searchExpanded: false,
    scroll: null,

    setLoading() {
      if (get().status !== 'ready') set({ status: 'loading', message: null })
    },

    setMissing(message) {
      set({ status: 'missing', message, history: null, model: null })
    },

    setError(message) {
      set({ status: 'error', message, history: null, model: null })
    },

    setHistory(history, source, keep = false) {
      const filters = keep ? get().filters : DEFAULT_FILTERS
      const model = buildGitModel(history, filters)
      let selected = keep ? get().selected : null
      if (!keep) {
        const wanted = readHashParam('commit')
        if (wanted) selected = wanted === WORKTREE ? WORKTREE : (model.rows.find((r) => r.hash.startsWith(wanted))?.hash ?? null)
      }
      if (selected && !model.rowOf.has(selected)) selected = null
      const found = rematch(model, get().query, get().path)
      // Opened from the map's "History" button before the history had loaded: go to the newest match.
      if (!selected && get().path && found.matches && found.matches.length > 0) selected = model.rows[found.matches[0]].hash
      set({ status: 'ready', message: null, history, source, model, filters, selected, ...found })
      if (selected && !keep) requestScroll(model.rowOf.get(selected)!)
    },

    select(hash, scroll = true) {
      const { model } = get()
      const narrow = mediaMatches(NARROW)
      set({
        selected: hash,
        ...(narrow && hash !== null ? { panelOpen: false, sheetExpanded: false, searchExpanded: false } : {}),
      })
      writeHashParams({ commit: hash ? (hash === WORKTREE ? WORKTREE : hash.slice(0, 12)) : null })
      if (hash && scroll && model?.rowOf.has(hash)) requestScroll(model.rowOf.get(hash)!)
    },

    move(delta) {
      const { model, selected } = get()
      if (!model || model.rows.length === 0) return
      const current = selected !== null ? (model.rowOf.get(selected) ?? -1) : -1
      const next = current < 0 ? (delta > 0 ? 0 : model.rows.length - 1) : Math.max(0, Math.min(model.rows.length - 1, current + delta))
      get().select(model.rows[next].hash)
    },

    selectEdge(edge) {
      const { model } = get()
      if (!model || model.rows.length === 0) return
      get().select(model.rows[edge === 'first' ? 0 : model.rows.length - 1].hash)
    },

    jumpToHead() {
      const { model, history } = get()
      const head = history?.repo.head?.commit
      if (model && head && model.rowOf.has(head)) get().select(head)
    },

    setQuery(query) {
      const { model, path } = get()
      set({ query, ...rematch(model, query, path) })
    },

    setPath(path) {
      const { model, query } = get()
      const found = rematch(model, query, path)
      set({ path, ...found })
      // Jump to the newest commit that touched the file.
      if (path && model && found.matches && found.matches.length > 0) get().select(model.rows[found.matches[0]].hash)
    },

    step(direction) {
      const { model, matches, selected } = get()
      if (!model || !matches || matches.length === 0) return
      const current = selected !== null ? (model.rowOf.get(selected) ?? -1) : -1
      let target: number | undefined
      if (direction > 0) target = matches.find((row) => row > current) ?? matches[0]
      else target = [...matches].reverse().find((row) => row < current) ?? matches[matches.length - 1]
      get().select(model.rows[target].hash)
    },

    setFilters(filters) {
      rebuild({ ...get().filters, ...filters })
    },

    toggleRef(key) {
      const { filters } = get()
      const hidden = filters.hiddenRefs.includes(key) ? filters.hiddenRefs.filter((k) => k !== key) : [...filters.hiddenRefs, key]
      rebuild({ ...filters, hiddenRefs: hidden })
    },

    soloRef(key) {
      const { history, filters } = get()
      if (!history) return
      const type = key.split(':')[0]
      rebuild({
        ...filters,
        remotes: filters.remotes || type === 'remote',
        tags: filters.tags || type === 'tag',
        hiddenRefs: history.refs.map(refKey).filter((k) => k !== key),
      })
    },

    resetFilters() {
      rebuild(DEFAULT_FILTERS)
    },

    togglePanel() {
      set({ panelOpen: !get().panelOpen })
    },

    setPanel(open) {
      if (get().panelOpen !== open) set({ panelOpen: open })
    },

    setSheetExpanded(expanded) {
      set({ sheetExpanded: expanded })
    },

    setSearchExpanded(expanded) {
      set({ searchExpanded: expanded })
    },
  }
})
