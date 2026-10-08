/**
 * The repository's files for the explorer, and creating, deleting and renaming them (when `repomap
 * serve` allows editing). After a change the server rebuilds the map; the viewer reloads it, and a
 * new or renamed file is selected in the map once it shows up there (see `revealFile` in the store).
 */
import { create } from 'zustand'
import { WRITE_HEADER } from '../../../src/shared/git-actions.ts'
import { onServerEvent } from './events.ts'
import { serverWritable } from './server.ts'
import { useViewer } from './store.ts'

export type FileDialog =
  | { kind: 'create'; folder: string }
  | { kind: 'rename'; path: string; folder: boolean }
  | { kind: 'delete'; path: string; folder: boolean; count: number }

export interface Placement {
  layer?: string
  role?: string
  reason?: string
  /** Left out of the map by the config's excludes. */
  excluded: boolean
}

type Operation = { op: 'create'; path: string; content?: string } | { op: 'delete'; path: string } | { op: 'rename'; from: string; to: string }

interface State {
  /** The server creates, deletes and renames files (null: not asked yet). */
  writable: boolean | null
  /** Every file git lists (writable servers); null: use the graph's files. */
  files: string[] | null
  dialog: FileDialog | null
  busy: boolean
}

interface Actions {
  refresh(): Promise<void>
  /** Runs an operation; resolves with the path to show afterwards, or null when it failed. */
  run(operation: Operation): Promise<string | null | undefined>
  openDialog(dialog: FileDialog): void
  closeDialog(): void
}

let listening = false

export const useFiles = create<State & Actions>((set, get) => ({
  writable: null,
  files: null,
  dialog: null,
  busy: false,

  async refresh() {
    if (!(await serverWritable())) {
      set({ writable: false, files: null })
      return
    }
    try {
      const response = await fetch('api/files', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      set({ writable: true, files: ((await response.json()) as { files: string[] }).files })
    } catch {
      set({ writable: true })
    }
    if (!listening) {
      listening = true
      // Files made elsewhere (a terminal, a checkout) show up when the map is rebuilt.
      onServerEvent('graph', () => void get().refresh())
      onServerEvent('git', () => void get().refresh())
    }
  },

  async run(operation) {
    if (get().busy) return null
    set({ busy: true, dialog: null })
    const viewer = useViewer.getState()
    try {
      const response = await fetch('api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' },
        body: JSON.stringify(operation),
        cache: 'no-store',
      })
      const result = (await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))) as { ok: boolean; message?: string; error?: string; path?: string }
      if (!result.ok) {
        viewer.notify(`Could not ${operation.op} ${operation.op === 'rename' ? operation.from : operation.path}: ${result.error ?? 'failed'}`)
        return null
      }
      viewer.notify(`${result.message} · the map updates in a moment`)
      await get().refresh()
      return result.path
    } catch (error) {
      viewer.notify(`Could not ${operation.op}: ${(error as Error).message}`)
      return null
    } finally {
      set({ busy: false })
    }
  },

  openDialog(dialog) {
    set({ dialog })
  },

  closeDialog() {
    if (get().dialog) set({ dialog: null })
  },
}))

/** Where the build would put a (new) file: its layer and role, from the config's rules. */
export async function placementOf(path: string, signal?: AbortSignal): Promise<Placement | null> {
  try {
    const response = await fetch(`api/files/classify?path=${encodeURIComponent(path)}`, { cache: 'no-store', signal })
    if (!response.ok) return null
    return (await response.json()) as Placement
  } catch {
    return null
  }
}

/** Files under a folder ("" = the whole repository). */
export function filesIn(files: readonly string[], folder: string): string[] {
  return folder ? files.filter((f) => f.startsWith(`${folder}/`)) : [...files]
}
