/**
 * Whether the page is served by `repomap serve` with editing on (your own repository, on localhost):
 * then files can be saved, created, deleted and renamed, and git commands run. Asked once; a
 * read-only server answers `{ writable: false }`, a static host answers with the app's HTML.
 */
let writable: Promise<boolean> | null = null

export function serverWritable(): Promise<boolean> {
  writable ??= fetch('api/info', { cache: 'no-store' })
    .then(async (response) => (response.headers.get('content-type') ?? '').includes('application/json') && ((await response.json()) as { writable?: boolean }).writable === true)
    .catch(() => false)
  return writable
}
