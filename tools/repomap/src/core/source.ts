/**
 * Serving source files to the viewer's code panel.
 *
 * Only files that a node of the served graph points at can be read (so a request can never reach
 * .env files, keys, or anything outside the repository), and only text files up to 2 MB.
 */
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, posix, resolve, sep } from 'node:path'
import type { RepoGraph } from '../shared/types.ts'

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024

export type SourceResult = { ok: true; text: string } | { ok: false; status: number; error: string }

const allowedFiles = new WeakMap<RepoGraph, Set<string>>()

function filesOf(graph: RepoGraph): Set<string> {
  let files = allowedFiles.get(graph)
  if (!files) {
    files = new Set(graph.nodes.map((n) => n.file).filter((f): f is string => !!f))
    allowedFiles.set(graph, files)
  }
  return files
}

export function readSource(repoRoot: string, graph: RepoGraph | undefined, requested: string | null): SourceResult {
  if (!requested) return { ok: false, status: 400, error: 'Missing ?path=' }
  const path = posix.normalize(requested.replace(/\\/g, '/'))
  if (isAbsolute(path) || path.startsWith('../') || path === '..' || path.split('/').includes('..')) {
    return { ok: false, status: 403, error: 'Path must be relative to the repository' }
  }
  if (!graph || !filesOf(graph).has(path)) {
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
  const buffer = readFileSync(full)
  if (buffer.includes(0)) return { ok: false, status: 415, error: `${path} is a binary file` }
  return { ok: true, text: buffer.toString('utf8') }
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}
