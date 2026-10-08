/**
 * Git commands from the History tab: talks to `repomap serve` (GET /api/git/state, POST /api/git),
 * keeps the live state of the repository (branch, upstream, changed files, stashes, a merge in
 * progress), the command running, the last failure and the open dialog.
 *
 * Only available when the history comes from `repomap serve` of your own repository on localhost; a
 * static site, a dropped git.json or the demo stay read-only.
 */
import { create } from 'zustand'
import { actionProgress, WRITE_HEADER, type GitAction, type GitActionResult, type GitLiveState, type ResetMode } from '../../../src/shared/git-actions.ts'
import { onServerEvent } from '../model/events.ts'
import { serverWritable } from '../model/server.ts'
import { useViewer } from '../model/store.ts'
import { reloadServerHistory, withoutAnnouncements } from './load.ts'

/** A form or confirmation shown over the History tab. */
export type GitDialog =
  | { kind: 'create-branch'; from?: string; fromLabel?: string }
  | { kind: 'rename-branch'; name: string }
  | { kind: 'create-tag'; commit: string; label: string }
  | { kind: 'reset'; commit: string; label: string; mode?: ResetMode }
  | { kind: 'pick-branch'; purpose: 'merge' | 'squash' | 'rebase' }
  | { kind: 'delete-branch'; name: string; upstream?: string }
  | { kind: 'stash' }
  | { kind: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; action: GitAction }

export interface GitFailure {
  message: string
  output?: string
}

interface State {
  /** The server runs git commands (null: not asked yet). */
  available: boolean | null
  live: GitLiveState | null
  /** What is running, e.g. "Pushing…". */
  busy: string | null
  failure: GitFailure | null
  dialog: GitDialog | null
}

interface Actions {
  /** Asks the server for the live state (and whether it runs commands at all). */
  refresh(): Promise<void>
  /** Runs a command; resolves true when it worked. */
  run(action: GitAction): Promise<boolean>
  /** run() without the checks: sends the command and takes in the result. */
  perform(action: GitAction): Promise<boolean>
  openDialog(dialog: GitDialog): void
  closeDialog(): void
  dismissFailure(): void
}

let listening = false

export const useGitActions = create<State & Actions>((set, get) => ({
  available: null,
  live: null,
  busy: null,
  failure: null,
  dialog: null,

  async refresh() {
    try {
      // Asked once: a read-only server or a static host says no without a failed request.
      if (get().available === null) {
        if (!(await serverWritable())) {
          set({ available: false, live: null })
          return
        }
      }
      if (get().available === false) return
      const response = await fetch('api/git/state', { cache: 'no-store' })
      const type = response.headers.get('content-type') ?? ''
      // Not a git repository (or a hiccup): keep what is shown once commands worked.
      if (!response.ok || !type.includes('application/json')) {
        if (get().available === null) set({ available: false, live: null })
        return
      }
      set({ available: true, live: (await response.json()) as GitLiveState })
      if (!listening) {
        listening = true
        // Commits, checkouts and edits made elsewhere (a terminal, the code panel) change the state too.
        const again = () => void get().refresh()
        onServerEvent('git', again)
        onServerEvent('graph', again)
        window.addEventListener('focus', again)
      }
    } catch {
      // The server is unreachable (restarting): try again on the next event.
      if (get().available === null) set({ available: false, live: null })
    }
  },

  async run(action) {
    if (get().busy) return false
    set({ busy: actionProgress(action), failure: null, dialog: null })
    return withoutAnnouncements(() => get().perform(action))
  },

  async perform(action) {
    try {
      const response = await fetch('api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' },
        body: JSON.stringify(action),
        cache: 'no-store',
      })
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('application/json')) throw new Error((await response.text()) || `HTTP ${response.status}`)
      const result = (await response.json()) as GitActionResult
      if (result.state) set({ live: result.state })
      // A failed command can still change the repository (a merge stopped by conflicts).
      await reloadServerHistory()
      if (result.ok) {
        useViewer.getState().notify(result.message)
        return true
      }
      set({ failure: { message: result.error, output: result.output } })
      return false
    } catch (error) {
      set({ failure: { message: (error as Error).message || 'The server could not be reached.' } })
      return false
    } finally {
      set({ busy: null })
    }
  },

  openDialog(dialog) {
    set({ dialog })
  },

  closeDialog() {
    if (get().dialog) set({ dialog: null })
  },

  dismissFailure() {
    set({ failure: null })
  },
}))

/** Runs a command, or asks first when it can lose work. */
export function confirmThen(title: string, message: string, confirmLabel: string, action: GitAction, danger = true): void {
  useGitActions.getState().openDialog({ kind: 'confirm', title, message, confirmLabel, danger, action })
}
