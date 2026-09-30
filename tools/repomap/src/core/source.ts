/**
 * Serving (and saving) source files for the viewer's code panel.
 *
 * Only files that a node of the served graph points at can be read or written (so a request can never
 * reach .env files, keys, or anything outside the repository), only text files up to 2 MB, and only
 * files that exist: the editor changes files, it never creates them. A writable server also allows
 * the files git lists (tracked or untracked, never ignored ones — .env stays out) via `alsoAllowed`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, posix, resolve, sep } from 'node:path'
import type { RepoGraph } from '../shared/types.ts'

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024

export type SourceResult = { ok: true; text: string; etag: string } | { ok: false; status: number; error: string; etag?: string }

/** A strong ETag of a file's content: the editor sends it back, so a save never overwrites changes made elsewhere. */
export function etagOf(content: string | Buffer): string {
  return `"${createHash('sha256').update(content).digest('hex').slice(0, 32)}"`
}

const allowedFiles = new WeakMap<RepoGraph, Set<string>>()

function filesOf(graph: RepoGraph): Set<string> {
  let files = allowedFiles.get(graph)
  if (!files) {
    files = new Set(graph.nodes.map((n) => n.file).filter((f): f is string => !!f))
    allowedFiles.set(graph, files)
  }
  return files
}

/** Files beyond the graph's that may be read and written (e.g. every file git lists, on a writable server). */
export type AlsoAllowed = (path: string) => boolean

export function readSource(repoRoot: string, graph: RepoGraph | undefined, requested: string | null, alsoAllowed?: AlsoAllowed): SourceResult {
  const file = locate(repoRoot, graph, requested, alsoAllowed)
  if (!file.ok) return file
  const buffer = readFileSync(file.full)
  if (buffer.includes(0)) return { ok: false, status: 415, error: `${file.path} is a binary file` }
  return { ok: true, text: buffer.toString('utf8'), etag: etagOf(buffer) }
}

/**
 * Saves the editor's text over a file of the graph. With `ifMatch` (the ETag it was loaded with), a
 * file changed since then is left alone: 412 with the current ETag.
 */
export function writeSource(
  repoRoot: string,
  graph: RepoGraph | undefined,
  requested: string | null,
  text: string,
  ifMatch?: string | null,
  alsoAllowed?: AlsoAllowed,
): SourceResult {
  const file = locate(repoRoot, graph, requested, alsoAllowed)
  if (!file.ok) return file
  const next = Buffer.from(text, 'utf8')
  if (next.length > MAX_SOURCE_BYTES) return { ok: false, status: 413, error: `The new ${file.path} would be larger than 2 MB` }
  if (next.includes(0)) return { ok: false, status: 415, error: 'Text files cannot contain NUL characters' }
  const current = readFileSync(file.full)
  if (current.includes(0)) return { ok: false, status: 415, error: `${file.path} is a binary file` }
  const etag = etagOf(current)
  if (ifMatch && ifMatch !== '*' && ifMatch !== etag) return { ok: false, status: 412, error: `${file.path} changed on disk since it was opened`, etag }
  // In place (not write-and-rename): keeps the file's permissions, links and identity for watchers.
  if (!current.equals(next)) writeFileSync(file.full, next)
  return { ok: true, text, etag: etagOf(next) }
}

type Located = { ok: true; path: string; full: string } | { ok: false; status: number; error: string }

function locate(repoRoot: string, graph: RepoGraph | undefined, requested: string | null, alsoAllowed?: AlsoAllowed): Located {
  if (!requested) return { ok: false, status: 400, error: 'Missing ?path=' }
  const path = posix.normalize(requested.replace(/\\/g, '/'))
  if (isAbsolute(path) || path.startsWith('../') || path === '..' || path.split('/').includes('..')) {
    return { ok: false, status: 403, error: 'Path must be relative to the repository' }
  }
  if (!(graph && filesOf(graph).has(path)) && !alsoAllowed?.(path)) {
    return { ok: false, status: 404, error: `${path} is not part of the graph` }
  }
  const root = safeRealpath(resolve(repoRoot))
  const full = safeRealpath(resolve(root, path))
  if (!full.startsWith(root + sep)) return { ok: false, status: 403, error: 'Path escapes the repository' }
  let size: number
  try {
    const stat = statSync(full)
    if (!stat.isFile()) return { ok: false, status: 404, error: `${path} is not a file` }
    size = stat.size
  } catch {
    return { ok: false, status: 404, error: `${path} does not exist in this checkout` }
  }
  if (size > MAX_SOURCE_BYTES) return { ok: false, status: 413, error: `${path} is larger than 2 MB` }
  return { ok: true, path, full }
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}
