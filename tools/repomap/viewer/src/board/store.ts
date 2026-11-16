/**
 * Board tab state (zustand): where you are (the path, kept in the URL hash), what is selected, the
 * display options, review mode and the AI job.
 */
import { create } from 'zustand'
import type { ReviewFile } from '../../../src/shared/review.ts'
import { readHashParam, readPref, writeHashParams, writePref } from '../model/url.ts'
import { parentPath, samePath, type BoardOptions, type BoardPath } from './model.ts'

export type BoardPanel = 'details' | 'files' | 'review' | 'rules' | 'ai'

export interface ReviewState {
  base?: string
  head: string
  label: string
  files: ReviewFile[]
  /** Node indices: changed lines; their dependents (up to two steps); tests covering either. */
  touched: Set<number>
  impacted: Set<number>
  tests: number[]
  /** Read from git.json (a commit's files), not the server: whole files, no line ranges. */
  approximate?: boolean
  briefing?: { loading: boolean; markdown?: string; error?: string }
}

export interface AiJob {
  running: boolean
  progress?: { phase: string; done: number; total: number }
  result?: { placed: number; written: number; failed: number; remaining: number }
  error?: string
}

interface State {
  path: BoardPath
  /** The boards you came through to get here, oldest first: going up retraces them. */
  history: BoardPath[]
  /** A chip id, or `wire:<id>`. */
  selected: string | null
  options: BoardOptions
  panel: BoardPanel
  /** Narrow screens: the panel is pulled up. */
  sheetOpen: boolean
  review: ReviewState | null
  reviewLoading: boolean
  reviewError: string | null
  /** Node indices to light up (the assistant pointed at them, or a search hit). */
  focus: number[] | null
  /** Which way the last level change went (the board animates it). */
  motion: 'in' | 'out' | null
  ai: AiJob | null
  /** The server can run the Board's AI (your own repository on localhost, with a key). */
  aiAvailable: boolean
}

interface Actions {
  navigate(path: BoardPath, motion?: 'in' | 'out' | null, select?: string | null): void
  /** Back to the board you came from (its parent when you didn't come from one); false when there's nowhere to go. */
  back(): boolean
  /** A step of the trail: that board, with the boards before it as its history. */
  goToStep(path: BoardPath, history: BoardPath[]): void
  select(id: string | null): void
  setOption(option: keyof BoardOptions, value: boolean): void
  setPanel(panel: BoardPanel): void
  setSheetOpen(open: boolean): void
  setReview(review: ReviewState | null): void
  setReviewLoading(loading: boolean, error?: string | null): void
  setBriefing(briefing: ReviewState['briefing']): void
  setFocus(nodes: number[] | null): void
  setAi(job: AiJob | null): void
  setAiAvailable(available: boolean): void
}

export function encodePath(path: BoardPath): string | null {
  if (path.level === 'app') return null
  const parts: string[] = [path.level]
  if ('tier' in path) parts.push(path.tier)
  if ('feature' in path) parts.push(path.feature, path.group ?? '')
  if (path.level === 'chip') parts.push(path.chip)
  return parts.map(encodeURIComponent).join('~')
}

export function decodePath(text: string | null): BoardPath {
  if (!text) return { level: 'app' }
  const [level, tier, feature, group, chip] = text.split('~').map(decodeURIComponent)
  const g = group ? { group } : {}
  switch (level) {
    case 'tiers':
      return { level: 'tiers' }
    case 'features':
      return tier ? { level: 'features', tier } : { level: 'tiers' }
    case 'chips':
      return tier && feature ? { level: 'chips', tier, feature, ...g } : { level: 'tiers' }
    case 'chip':
      return tier && feature && chip ? { level: 'chip', tier, feature, ...g, chip } : { level: 'tiers' }
    default:
      return { level: 'app' }
  }
}

const MAX_HISTORY = 50

export const useBoard = create<State & Actions>((set, get) => ({
  path: decodePath(readHashParam('board')),
  history: [],
  selected: null,
  options: { showHidden: readPref<string>('board.hidden', '0') === '1', typeLinks: readPref<string>('board.types', '0') === '1', states: readPref<string>('board.states', '1') === '1' },
  panel: 'details',
  sheetOpen: false,
  review: null,
  reviewLoading: false,
  reviewError: null,
  focus: null,
  motion: null,
  ai: null,
  aiAvailable: false,

  navigate(path, motion = null, select = null) {
    const { path: from, history } = get()
    set({ path, motion, selected: select, history: samePath(from, path) ? history : [...history, from].slice(-MAX_HISTORY) })
    writeHashParams({ board: encodePath(path) })
  },
  back() {
    const { path, history } = get()
    // The chip you're leaving is selected where you land, so you see where you were.
    const leaving = path.level === 'chip' ? path.chip : null
    const previous = history.at(-1) ?? parentPath(path)
    if (!previous) return false
    set({ path: previous, motion: 'out', selected: leaving, history: history.slice(0, -1) })
    writeHashParams({ board: encodePath(previous) })
    return true
  },
  goToStep(path, history) {
    set({ path, motion: 'out', selected: null, history })
    writeHashParams({ board: encodePath(path) })
  },
  select(id) {
    if (get().selected === id) return
    set({ selected: id, panel: id ? 'details' : get().panel })
  },
  setOption(option, value) {
    set({ options: { ...get().options, [option]: value } })
    writePref(option === 'showHidden' ? 'board.hidden' : option === 'states' ? 'board.states' : 'board.types', value ? '1' : '0')
  },
  setPanel(panel) {
    set({ panel, sheetOpen: true })
  },
  setSheetOpen(open) {
    set({ sheetOpen: open })
  },
  setReview(review) {
    set({ review, reviewError: null, reviewLoading: false })
  },
  setReviewLoading(loading, error = null) {
    set({ reviewLoading: loading, reviewError: error })
  },
  setBriefing(briefing) {
    const review = get().review
    if (review) set({ review: { ...review, briefing } })
  },
  setFocus(nodes) {
    set({ focus: nodes })
  },
  setAi(job) {
    set({ ai: job })
  },
  setAiAvailable(available) {
    set({ aiAvailable: available })
  },
}))

// Back/forward and edited links: follow the hash.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const path = decodePath(readHashParam('board'))
    if (encodePath(path) !== encodePath(useBoard.getState().path)) useBoard.setState({ path, selected: null, motion: null })
  })
}
