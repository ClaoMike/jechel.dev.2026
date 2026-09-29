/**
 * Viewer state (zustand). Derived data — visibility, counts, trace, rolled-up edges — is recomputed
 * in the actions that change its inputs, so rendering code only reads plain arrays.
 */
import { create } from 'zustand'
import type { RepoGraph, Visibility } from '../../../src/shared/types.ts'
import type { ColorBy } from './colors.ts'
import {
  computeCounts,
  computeVisibility,
  everything,
  fromPreset,
  rollUpEdges,
  sameFilters,
  type Counts,
  type FilterState,
  type RolledEdge,
  type Visibilities,
} from './filters.ts'
import { indexGraph, type GraphIndex } from './graph.ts'
import { computeTrace, type TraceResult } from './trace.ts'
import { readPref, writePref, type ViewState } from './url.ts'

export type Theme = 'dark' | 'light'
export type LabelMode = 'auto' | 'all' | 'none'

export type CameraCommand =
  | { type: 'fit'; nonce: number }
  | { type: 'focus'; node: number; nonce: number }
  | { type: 'layer'; layer: string; nonce: number }
  | { type: 'side'; nonce: number }
  | { type: 'reset'; nonce: number }

/** Omit that distributes over union members (plain Omit collapses a union to its shared keys). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type CameraRequest = DistributiveOmit<CameraCommand, 'nonce'>

export interface GraphSource {
  kind: 'server' | 'url' | 'file' | 'demo'
  name: string
}

interface State {
  graph: RepoGraph | null
  index: GraphIndex | null
  source: GraphSource | null
  loading: boolean
  error: string | null

  filters: FilterState
  presetId: string | null
  visibility: Visibilities | null
  counts: Counts | null
  rolled: RolledEdge[]

  selected: number | null
  hovered: number | null
  trace: TraceResult | null
  traceTests: boolean

  colorBy: ColorBy
  labels: LabelMode
  theme: Theme
  showChanges: boolean
  sidebarOpen: boolean
  helpOpen: boolean
  searchOpen: boolean
  camera: CameraCommand | null
  toast: { text: string; nonce: number } | null
  /** Bumped whenever something the 3D scene draws changes. */
  version: number
}

interface Actions {
  setGraph(graph: RepoGraph, source: GraphSource, view?: ViewState | null, keepView?: boolean): void
  setLoading(loading: boolean): void
  setError(error: string | null): void
  applyPreset(id: string): void
  setFacet(facet: 'layers' | 'kinds' | 'roles' | 'edgeTypes' | 'sources', key: string, value: Visibility): void
  setFacetMany(facet: 'layers' | 'kinds' | 'roles' | 'edgeTypes' | 'sources', values: Record<string, Visibility>): void
  setOption(option: 'hideOrphans' | 'rollUp' | 'showUnresolved', value: boolean): void
  setMinConfidence(value: number): void
  select(i: number | null, focus?: boolean): void
  hover(i: number | null): void
  setTraceTests(value: boolean): void
  setColorBy(value: ColorBy): void
  setLabels(value: LabelMode): void
  setTheme(value: Theme): void
  setShowChanges(value: boolean): void
  toggleSidebar(): void
  setHelp(open: boolean): void
  setSearchOpen(open: boolean): void
  command(command: CameraRequest): void
  notify(text: string): void
  viewState(): ViewState
}

function initialTheme(): Theme {
  const stored = readPref<'dark' | 'light' | 'auto'>('theme', 'auto')
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const useViewer = create<State & Actions>((set, get) => {
  /** Recompute everything derived from filters (and the trace, which depends on the graph only). */
  const derive = (filters: FilterState, extra: Partial<State> = {}) => {
    const { index } = { ...get(), ...extra }
    if (!index) return set({ filters, ...extra })
    const visibility = computeVisibility(index, filters)
    set({
      ...extra,
      filters,
      visibility,
      counts: computeCounts(index, visibility),
      rolled: rollUpEdges(index, filters, visibility),
      version: get().version + 1,
    })
  }

  const matchPreset = (filters: FilterState, index: GraphIndex): string | null => {
    for (const preset of index.graph.meta.presets) {
      if (sameFilters(fromPreset(preset.filter, index), filters)) return preset.id
    }
    return null
  }

  return {
    graph: null,
    index: null,
    source: null,
    loading: true,
    error: null,
    filters: everything(),
    presetId: 'everything',
    visibility: null,
    counts: null,
    rolled: [],
    selected: null,
    hovered: null,
    trace: null,
    traceTests: false,
    colorBy: readPref<ColorBy>('colorBy', 'kind'),
    labels: readPref<LabelMode>('labels', 'auto'),
    theme: initialTheme(),
    showChanges: true,
    sidebarOpen: window.innerWidth > 720,
    helpOpen: false,
    searchOpen: false,
    camera: null,
    toast: null,
    version: 0,

    setGraph(graph, source, view, keepView) {
      const index = indexGraph(graph)
      const previous = get()
      let filters = everything()
      let presetId: string | null = 'everything'
      if (keepView && previous.index) {
        filters = previous.filters
        presetId = previous.presetId
      } else if (view?.preset) {
        const preset = graph.meta.presets.find((p) => p.id === view.preset)
        if (preset) {
          filters = fromPreset(preset.filter, index)
          presetId = preset.id
        }
      }
      if (!keepView && view?.filters) {
        filters = { ...everything(), ...view.filters } as FilterState
        presetId = matchPreset(filters, index)
      }
      const selectedId = keepView && previous.selected !== null && previous.index ? previous.index.nodes[previous.selected]?.id : view?.selected
      const selected = selectedId !== undefined ? (index.byId.get(selectedId) ?? null) : null
      derive(filters, {
        graph,
        index,
        source,
        loading: false,
        error: null,
        presetId,
        selected,
        hovered: null,
        trace: selected !== null ? computeTrace(index, selected, { includeTests: previous.traceTests }) : null,
        colorBy: view?.colorBy ?? previous.colorBy,
        labels: view?.labels ?? previous.labels,
      })
      if (!keepView) get().command(selected !== null ? { type: 'focus', node: selected } : { type: 'fit' })
    },

    setLoading(loading) {
      set({ loading })
    },

    setError(error) {
      set({ error, loading: false })
    },

    applyPreset(id) {
      const { index } = get()
      const preset = index?.graph.meta.presets.find((p) => p.id === id)
      if (!index || !preset) return
      derive(fromPreset(preset.filter, index, get().filters), { presetId: id })
    },

    setFacet(facet, key, value) {
      get().setFacetMany(facet, { [key]: value })
    },

    setFacetMany(facet, values) {
      const { filters, index } = get()
      const map = { ...filters[facet] }
      for (const [key, value] of Object.entries(values)) {
        if (value === 'show') delete map[key]
        else map[key] = value
      }
      const next = { ...filters, [facet]: map }
      derive(next, { presetId: index ? matchPreset(next, index) : null })
    },

    setOption(option, value) {
      const { filters, index } = get()
      const next = { ...filters, [option]: value }
      derive(next, { presetId: index ? matchPreset(next, index) : null })
    },

    setMinConfidence(value) {
      const { filters, index } = get()
      const next = { ...filters, minConfidence: value }
      derive(next, { presetId: index ? matchPreset(next, index) : null })
    },

    select(i, focus = false) {
      const { index, traceTests } = get()
      set({
        selected: i,
        trace: i !== null && index ? computeTrace(index, i, { includeTests: traceTests }) : null,
        version: get().version + 1,
      })
      if (i !== null && focus) get().command({ type: 'focus', node: i })
    },

    hover(i) {
      if (get().hovered !== i) set({ hovered: i })
    },

    setTraceTests(value) {
      const { index, selected } = get()
      set({
        traceTests: value,
        trace: selected !== null && index ? computeTrace(index, selected, { includeTests: value }) : null,
        version: get().version + 1,
      })
    },

    setColorBy(value) {
      writePref('colorBy', value)
      set({ colorBy: value, version: get().version + 1 })
    },

    setLabels(value) {
      writePref('labels', value)
      set({ labels: value, version: get().version + 1 })
    },

    setTheme(value) {
      writePref('theme', value)
      set({ theme: value, version: get().version + 1 })
    },

    setShowChanges(value) {
      set({ showChanges: value, version: get().version + 1 })
    },

    toggleSidebar() {
      set({ sidebarOpen: !get().sidebarOpen })
    },

    setHelp(open) {
      set({ helpOpen: open })
    },

    setSearchOpen(open) {
      set({ searchOpen: open })
    },

    command(command) {
      set({ camera: { ...command, nonce: Date.now() + Math.random() } as CameraCommand })
    },

    notify(text) {
      set({ toast: { text, nonce: Date.now() } })
    },

    viewState() {
      const { filters, presetId, selected, index, colorBy, labels } = get()
      const view: ViewState = {}
      if (presetId && presetId !== 'everything') view.preset = presetId
      else if (!presetId) view.filters = filters
      if (selected !== null && index) view.selected = index.nodes[selected].id
      if (colorBy !== 'kind') view.colorBy = colorBy
      if (labels !== 'auto') view.labels = labels
      return view
    },
  }
})
