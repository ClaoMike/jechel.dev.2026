/**
 * Where the graph comes from, in order:
 *   1. ?graph=<url>          any graph.json on the web (CORS permitting)
 *   2. ./graph.json          served next to the viewer (repomap serve, a deployed site, vite dev)
 *   3. the bundled demo      so the static site always shows something
 * Dropping or picking a graph.json file replaces it (a git.json goes to the History tab). When
 * served by `repomap serve --watch`, Server-Sent Events announce rebuilds and the graph reloads in place.
 */
import { checkGitHistory, type GitHistory } from '../../../src/shared/git-types.ts'
import type { RepoGraph } from '../../../src/shared/types.ts'
import { useGit } from '../git/store.ts'
import { onServerEvent } from './events.ts'
import { checkGraph } from './graph.ts'
import { useViewer, type GraphSource } from './store.ts'
import { readStoredView, readViewFromHash } from './url.ts'

async function fetchGraph(url: string): Promise<RepoGraph> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('text/html')) throw new Error(`${url}: not a JSON file`)
  const json = (await response.json()) as unknown
  const problem = checkGraph(json)
  if (problem) throw new Error(`${url}: ${problem}`)
  return json as RepoGraph
}

export async function loadInitialGraph(): Promise<void> {
  const store = useViewer.getState()
  const view = readViewFromHash() ?? readStoredView()
  const params = new URLSearchParams(window.location.search)
  const explicit = params.get('graph')
  try {
    if (explicit) {
      store.setGraph(await fetchGraph(explicit), { kind: 'url', name: explicit }, view)
      return
    }
    try {
      const graph = await fetchGraph('graph.json')
      store.setGraph(graph, { kind: 'server', name: graph.meta.repo.name }, view)
      listenForUpdates()
      return
    } catch {
      // No graph next to the viewer: fall back to the demo.
    }
    const demo = await fetchGraph('samples/demo.graph.json')
    store.setGraph(demo, { kind: 'demo', name: demo.meta.repo.name }, view)
  } catch (error) {
    store.setError((error as Error).message)
  }
}

export async function loadGraphFile(file: File): Promise<void> {
  const store = useViewer.getState()
  try {
    const json = JSON.parse(await file.text()) as unknown
    if ((json as { kind?: unknown } | null)?.kind === 'repomap-git') {
      const problem = checkGitHistory(json)
      if (problem) throw new Error(problem)
      useGit.getState().setHistory(json as GitHistory, { kind: 'file', name: file.name })
      store.setTab('git')
      store.notify(`Loaded ${file.name}`)
      return
    }
    const problem = checkGraph(json)
    if (problem) throw new Error(problem)
    const source: GraphSource = { kind: 'file', name: file.name }
    store.setGraph(json as RepoGraph, source, null)
    store.notify(`Loaded ${file.name}`)
  } catch (error) {
    store.notify(`Could not open ${file.name}: ${(error as Error).message}`)
  }
}

function listenForUpdates(): void {
  onServerEvent('graph', async () => {
    try {
      const graph = await fetchGraph('graph.json')
      const store = useViewer.getState()
      if (store.source?.kind !== 'server') return
      const before = store.graph?.nodes.length ?? 0
      store.setGraph(graph, { kind: 'server', name: graph.meta.repo.name }, null, true)
      const delta = graph.nodes.length - before
      const changes = graph.meta.changes
      const detail = changes ? `+${changes.addedNodes.length} / −${changes.removedNodes.length} nodes` : `${delta >= 0 ? '+' : ''}${delta} nodes`
      store.notify(`Graph updated (${detail})`)
    } catch (error) {
      useViewer.getState().notify(`Reload failed: ${(error as Error).message}`)
    }
  })
}
