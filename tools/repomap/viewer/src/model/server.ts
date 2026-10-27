/**
 * Whether the page is served by `repomap serve` with editing on (your own repository, on localhost):
 * then files can be saved, created, deleted and renamed, and git commands run. Asked once; a
 * read-only server answers `{ writable: false }`, a static host answers with the app's HTML.
 */
export interface ServerInfo {
  writable: boolean
  /** The AI assistant is available. */
  ai: boolean
  /** The Board's AI (summaries, briefings, rule suggestions) is available. */
  boardAi?: boolean
}

let info: Promise<ServerInfo> | null = null

export function serverInfo(): Promise<ServerInfo> {
  info ??= fetch('api/info', { cache: 'no-store' })
    .then(async (response) => {
      if (!(response.headers.get('content-type') ?? '').includes('application/json')) return { writable: false, ai: false }
      const data = (await response.json()) as Partial<ServerInfo>
      return { writable: data.writable === true, ai: data.writable === true && data.ai === true, boardAi: data.writable === true && data.boardAi === true }
    })
    .catch(() => ({ writable: false, ai: false }))
  return info
}

export function serverWritable(): Promise<boolean> {
  return serverInfo().then((i) => i.writable)
}
