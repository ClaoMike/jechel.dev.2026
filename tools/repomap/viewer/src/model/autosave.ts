/**
 * Autosave for the code panel: a save a short while after the last keystroke, one save at a time,
 * the newest text always wins, failures are retried, and a file changed on disk is never overwritten
 * without asking (status "conflict"). No DOM: the editor tells it about changes, it calls `save`.
 */
import { SaveConflictError } from './source.ts'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict'

export interface AutosaveState {
  status: SaveStatus
  /** Why the last save failed. */
  error?: string
  /** When the file was last written (ms). */
  savedAt?: number
}

export interface AutosaverOptions {
  /** The editor's current text. */
  read(): string
  /** Writes the text; resolves with the file's new version. Throws SaveConflictError when it changed on disk. */
  save(text: string, etag: string | null, keepalive: boolean): Promise<string | null>
  /** Version of the file as loaded. */
  etag: string | null
  onState(state: AutosaveState): void
  /** Quiet time after the last change before saving (ms). */
  delay?: number
  /** Wait before retrying a failed save (ms). */
  retryDelay?: number
}

export class Autosaver {
  etag: string | null
  private readonly options: AutosaverOptions
  private state: AutosaveState = { status: 'saved' }
  private version = 0
  private savedVersion = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private queue: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(options: AutosaverOptions) {
    this.options = options
    this.etag = options.etag
  }

  get status(): SaveStatus {
    return this.state.status
  }

  /** There are changes the file doesn't have yet. */
  get dirty(): boolean {
    return this.version !== this.savedVersion
  }

  /** The user changed the text. */
  change(): void {
    this.version++
    if (this.state.status === 'conflict') return
    if (this.state.status !== 'saving') this.emit({ status: 'pending' })
    this.schedule(this.options.delay ?? 800)
  }

  /** Saves now (⌘S, closing, leaving the page). Resolves true when the file has everything. */
  flush(keepalive = false): Promise<boolean> {
    clearTimeout(this.timer)
    this.queue = this.queue.then(() => this.saveLoop(keepalive))
    return this.queue.then(() => !this.dirty)
  }

  /** After a conflict: write the editor's text over the file anyway. */
  overwrite(): Promise<boolean> {
    this.etag = null
    this.emit({ status: 'pending' })
    return this.flush()
  }

  /** The editor now shows the file as it is on disk (reloaded): nothing to save. */
  reloaded(etag: string | null): void {
    clearTimeout(this.timer)
    this.etag = etag
    this.savedVersion = this.version
    this.emit({ status: 'saved', savedAt: this.state.savedAt })
  }

  /** Stops the timers; a save already running finishes. */
  dispose(): void {
    this.disposed = true
    clearTimeout(this.timer)
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer)
    if (this.disposed) return
    this.timer = setTimeout(() => void this.flush(), ms)
  }

  private async saveLoop(keepalive: boolean): Promise<void> {
    while (this.dirty && this.state.status !== 'conflict') {
      const version = this.version
      const text = this.options.read()
      this.emit({ status: 'saving', savedAt: this.state.savedAt })
      try {
        this.etag = await this.options.save(text, this.etag, keepalive)
        this.savedVersion = version
        this.state.savedAt = Date.now()
      } catch (error) {
        if (error instanceof SaveConflictError) {
          this.emit({ status: 'conflict', error: error.message, savedAt: this.state.savedAt })
        } else {
          this.emit({ status: 'error', error: (error as Error).message, savedAt: this.state.savedAt })
          this.schedule(this.options.retryDelay ?? 4000)
        }
        return
      }
    }
    if (this.state.status !== 'conflict') this.emit({ status: this.dirty ? 'pending' : 'saved', savedAt: this.state.savedAt })
  }

  private emit(state: AutosaveState): void {
    this.state = state
    this.options.onState(state)
  }
}
