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
  /** The Projects menu (open, create) and Start/Stop/Reload with Docker. */
  projects?: boolean
  docker?: boolean
}

let info: Promise<ServerInfo> | null = null

export function serverInfo(): Promise<ServerInfo> {
  info ??= fetch('api/info', { cache: 'no-store' })
    .then(async (response) => {
      if (!(response.headers.get('content-type') ?? '').includes('application/json')) return { writable: false, ai: false }
      const data = (await response.json()) as Partial<ServerInfo>
      const writable = data.writable === true
      return { writable, ai: writable && data.ai === true, boardAi: writable && data.boardAi === true, projects: writable && data.projects === true, docker: writable && data.docker === true }
    })
    .catch(() => ({ writable: false, ai: false }))
  return info
}

export function serverWritable(): Promise<boolean> {
  return serverInfo().then((i) => i.writable)
}
