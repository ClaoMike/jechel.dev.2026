/**
 * Where the history comes from, in order (loaded when the History tab is first opened):
 *   1. ?git=<url>                 any git.json on the web (CORS permitting)
 *   2. next to ?graph=            name.graph.json → name.git.json, else git.json in the same folder
 *   3. ./git.json                 served next to the viewer (repomap serve, a deployed site, vite dev)
 *   4. the bundled demo           only when the map is the demo too
 * `repomap serve --watch` announces rebuilt histories over Server-Sent Events.
 */
import { checkGitHistory, type GitHistory } from '../../../src/shared/git-types.ts'
import { onServerEvent } from '../model/events.ts'
import { useViewer } from '../model/store.ts'
import { historyUrlsFor } from './model.ts'
import { useGit } from './store.ts'

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function fetchHistory(url: string): Promise<GitHistory> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new HttpError(response.status, `${url}: HTTP ${response.status}`)
  if ((response.headers.get('content-type') ?? '').includes('text/html')) throw new HttpError(404, `${url}: not a JSON file`)
  const json = (await response.json()) as unknown
  const problem = checkGitHistory(json)
  if (problem) throw new Error(`${url}: ${problem}`)
  return json as GitHistory
}

/** Resolves once the map's graph has loaded (or failed): where it came from decides where the history does. */
function graphSettled(): Promise<void> {
  return new Promise((resolveSettled) => {
    if (!useViewer.getState().loading) return resolveSettled()
    const unsubscribe = useViewer.subscribe((state) => {
      if (state.loading) return
      unsubscribe()
      resolveSettled()
    })
  })
}

let started = false

/** Loads the history once (the History tab calls it when first shown). */
export function ensureGitHistory(): void {
  if (started || useGit.getState().history) return
  started = true
  void loadGitHistory()
}

export async function loadGitHistory(): Promise<void> {
  const git = useGit.getState()
  git.setLoading()
  const params = new URLSearchParams(window.location.search)
  try {
    const explicit = params.get('git')
    if (explicit) {
      git.setHistory(await fetchHistory(explicit), { kind: 'url', name: explicit })
      return
    }
    const graphUrl = params.get('graph')
    if (graphUrl) {
      for (const url of historyUrlsFor(graphUrl, window.location.href)) {
        try {
          git.setHistory(await fetchHistory(url), { kind: 'url', name: url })
          return
        } catch {
          // try the next candidate
        }
      }
      git.setMissing(`No git.json next to ${graphUrl}. Add ?git=<url of a git.json> to the address to show one.`)
      return
    }
    await graphSettled()
    try {
      const history = await fetchHistory('git.json')
      git.setHistory(history, { kind: 'server', name: history.repo.name })
      listen()
      return
    } catch (error) {
      if (useViewer.getState().source?.kind !== 'demo' && error instanceof HttpError && error.status === 404) {
        git.setMissing('No git history yet. It is written next to graph.json by `npm run map` when the mapped folder is a git repository.')
        listen()
        return
      }
      if (useViewer.getState().source?.kind !== 'demo') throw error
    }
    const demo = await fetchHistory('samples/demo.git.json')
    git.setHistory(demo, { kind: 'demo', name: demo.repo.name })
  } catch (error) {
    git.setError((error as Error).message)
  }
}

let listening = false

function listen(): void {
  if (listening) return
  listening = true
  onServerEvent('git', async () => {
    const git = useGit.getState()
    if (git.source && git.source.kind !== 'server') return
    try {
      const history = await fetchHistory('git.json')
      const before = git.history?.commits.length ?? 0
      git.setHistory(history, { kind: 'server', name: history.repo.name }, git.status === 'ready')
      const added = history.commits.length - before
      if (before > 0 && added > 0) useViewer.getState().notify(`History updated: ${added} new commit${added === 1 ? '' : 's'}`)
    } catch {
      // Keep what is shown; the next rebuild tries again.
    }
  })
}
