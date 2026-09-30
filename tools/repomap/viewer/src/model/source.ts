/**
 * Source text for the code panel, from the `/source` endpoint of `repomap serve` (or `npm run dev`).
 * A static deployment has no source files, which is reported as "not available".
 */
export class SourceUnavailableError extends Error {}

export async function fetchSource(path: string, signal?: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch(`source?path=${encodeURIComponent(path)}`, { cache: 'no-store', signal })
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
  return text
}
