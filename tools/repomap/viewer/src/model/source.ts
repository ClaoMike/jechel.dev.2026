/**
 * Source text for the code panel, from the `/source` endpoint of `repomap serve` (or `npm run dev`),
 * and saving it back (PUT, when the server allows editing). A static deployment has no source files,
 * which is reported as "not available".
 */
import { WRITE_HEADER } from '../../../src/shared/git-actions.ts'

export class SourceUnavailableError extends Error {}

/** The file changed on disk since it was loaded: `etag` is its current version. */
export class SaveConflictError extends Error {
  readonly etag: string | null
  constructor(message: string, etag: string | null) {
    super(message)
    this.etag = etag
  }
}

export interface SourceFile {
  text: string
  /** Version of the file on disk, sent back when saving (null: the server doesn't do versions). */
  etag: string | null
  /** The server lets the code panel save this file. */
  writable: boolean
}

const url = (path: string) => `source?path=${encodeURIComponent(path)}`

export async function fetchSource(path: string, signal?: AbortSignal): Promise<SourceFile> {
  let response: Response
  try {
    response = await fetch(url(path), { cache: 'no-store', signal })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new SourceUnavailableError('The source server could not be reached.')
  }
  const type = response.headers.get('content-type') ?? ''
  // Static hosts answer unknown URLs with the app's index.html.
  if (response.ok && type.includes('text/html')) {
    throw new SourceUnavailableError('Source files are only available when the map is served by repomap on your machine.')
  }
  const text = await response.text()
  if (!response.ok) {
    if (response.status === 404 && !text) throw new SourceUnavailableError('Source files are only available when the map is served by repomap on your machine.')
    throw new SourceUnavailableError(text || `HTTP ${response.status}`)
  }
  return { text, etag: response.headers.get('etag'), writable: response.headers.get('x-repomap-writable') === '1' }
}

/**
 * Saves the text over the file; resolves with its new version. `etag` is the version it was loaded
 * with (null overwrites whatever is there). `keepalive` lets the request finish while the page closes.
 */
export async function saveSource(path: string, text: string, etag: string | null, options: { keepalive?: boolean } = {}): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(url(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', [WRITE_HEADER]: '1', 'If-Match': etag ?? '*' },
      body: text,
      cache: 'no-store',
      // Browsers cap keepalive bodies at 64 KB.
      keepalive: options.keepalive && new TextEncoder().encode(text).length < 64_000,
    })
  } catch {
    throw new Error('The server could not be reached.')
  }
  if (response.status === 412) throw new SaveConflictError(`${path} changed on disk since it was opened.`, response.headers.get('etag'))
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
  return response.headers.get('etag')
}
