/**
 * One Server-Sent Events connection to `repomap serve` (or the Vite dev server), shared by the map
 * and the history: "graph" and "git" announce rebuilt files. The browser reconnects by itself.
 */
type Handler = () => void

const handlers = new Map<string, Set<Handler>>()
let source: EventSource | null = null

export function onServerEvent(event: 'graph' | 'git', handler: Handler): () => void {
  if (typeof EventSource === 'undefined') return () => {}
  source ??= new EventSource('events')
  let set = handlers.get(event)
  if (!set) {
    const listeners = new Set<Handler>()
    set = listeners
    handlers.set(event, listeners)
    source.addEventListener(event, () => {
      for (const listener of listeners) listener()
    })
  }
  set.add(handler)
  return () => {
    set.delete(handler)
  }
}
