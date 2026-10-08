/**
 * Creating, deleting and renaming files and folders from the viewer (its file explorer and the
 * details panel), and the list of the repository's files it shows.
 *
 * Every path must be relative, stay inside the repository (symlinks included) and keep out of .git;
 * creating never overwrites, renaming never replaces, and a folder that holds another repository is
 * never deleted.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, resolve, sep } from 'node:path'
import { listRepoFiles } from './files.ts'
import { MAX_SOURCE_BYTES } from './source.ts'

/** A refused or failed file operation, with the HTTP status that says why. */
export class WorkspaceError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type FileOperation =
  | { op: 'create'; path: string; content?: string }
  | { op: 'delete'; path: string }
  | { op: 'rename'; from: string; to: string }

export interface FileOperationResult {
  message: string
  /** The path to show afterwards (the new file, the renamed one). */
  path?: string
  /** How many files a deleted folder held. */
  files?: number
}

/** A repository-relative path, checked: normalised, inside the repository, not in .git. */
export function checkPath(root: string, requested: unknown): { rel: string; full: string } {
  if (typeof requested !== 'string' || !requested.trim()) throw new WorkspaceError(400, 'A path is required')
  if (requested.includes('\0')) throw new WorkspaceError(400, 'Invalid path')
  const rel = posix.normalize(requested.trim().replace(/\\/g, '/')).replace(/\/+$/, '')
  if (isAbsolute(rel) || /^[a-z]:/i.test(rel) || rel === '..' || rel.startsWith('../') || rel.split('/').includes('..')) {
    throw new WorkspaceError(403, 'The path must be inside the repository')
  }
  if (rel === '.' || rel === '') throw new WorkspaceError(400, 'That is the repository itself')
  if (rel.split('/').some((part) => part.toLowerCase() === '.git')) throw new WorkspaceError(403, 'Files inside .git cannot be changed')
  const base = realpath(resolve(root))
  const full = resolve(base, rel)
  // The deepest part that exists decides where the path really goes (a symlinked folder may lead out).
  let existing = full
  while (!existsSync(existing) && existing !== base) existing = dirname(existing)
  const real = existing === full && lstatSync(full).isSymbolicLink() ? realpath(dirname(full)) : realpath(existing)
  if (real !== base && !real.startsWith(base + sep)) throw new WorkspaceError(403, 'The path leads out of the repository')
  return { rel, full }
}

export function applyFileOperation(root: string, operation: FileOperation): FileOperationResult {
  switch (operation?.op) {
    case 'create': {
      const { rel, full } = checkPath(root, operation.path)
      const content = operation.content ?? ''
      if (typeof content !== 'string') throw new WorkspaceError(400, 'content must be text')
      if (Buffer.byteLength(content) > MAX_SOURCE_BYTES) throw new WorkspaceError(413, 'The file would be larger than 2 MB')
      if (existsSync(full) || isSymlink(full)) throw new WorkspaceError(409, `${rel} already exists`)
      makeParents(root, full)
      writeFileSync(full, content, { flag: 'wx' })
      return { message: `Created ${rel}`, path: rel }
    }
    case 'delete': {
      const { rel, full } = checkPath(root, operation.path)
      if (!existsSync(full) && !isSymlink(full)) throw new WorkspaceError(404, `${rel} does not exist`)
      const stat = lstatSync(full)
      if (stat.isDirectory()) {
        if (existsSync(join(full, '.git'))) throw new WorkspaceError(403, `${rel} holds another repository`)
        const files = countFiles(full)
        rmSync(full, { recursive: true, force: true })
        return { message: `Deleted ${rel}/ (${files} ${files === 1 ? 'file' : 'files'})`, files }
      }
      // A symlink is removed, never what it points to.
      unlinkSync(full)
      return { message: `Deleted ${rel}` }
    }
    case 'rename': {
      const from = checkPath(root, operation.from)
      const to = checkPath(root, operation.to)
      if (!existsSync(from.full) && !isSymlink(from.full)) throw new WorkspaceError(404, `${from.rel} does not exist`)
      if (from.rel === to.rel) throw new WorkspaceError(400, 'The new name is the same')
      // Different case only (Readme.md → README.md) is a rename on case-insensitive disks too.
      const caseOnly = from.rel.toLowerCase() === to.rel.toLowerCase()
      if (!caseOnly && (existsSync(to.full) || isSymlink(to.full))) throw new WorkspaceError(409, `${to.rel} already exists`)
      if (to.rel.startsWith(`${from.rel}/`)) throw new WorkspaceError(400, 'A folder cannot move into itself')
      makeParents(root, to.full)
      renameSync(from.full, to.full)
      return { message: `Renamed ${from.rel} to ${to.rel}`, path: to.rel }
    }
    default:
      throw new WorkspaceError(400, `Unknown operation ${String((operation as { op?: unknown })?.op)}`)
  }
}

function makeParents(root: string, full: string): void {
  const parent = dirname(full)
  if (existsSync(parent) && !statSync(parent).isDirectory()) throw new WorkspaceError(409, 'A file is in the way of that folder')
  mkdirSync(parent, { recursive: true })
  const base = realpath(resolve(root))
  const real = realpath(parent)
  if (real !== base && !real.startsWith(base + sep)) throw new WorkspaceError(403, 'The path leads out of the repository')
}

function countFiles(dir: string): number {
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(join(dir, entry.name))
    else count++
  }
  return count
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

function realpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

// ---------------------------------------------------------------- the file list

const lists = new Map<string, { at: number; files: string[]; set: Set<string> }>()

/** The repository's files as git sees them (tracked + untracked, not ignored), cached for a second. */
export function workspaceFiles(root: string): { files: string[]; set: Set<string> } {
  const cached = lists.get(root)
  if (cached && Date.now() - cached.at < 1000) return cached
  const files = listRepoFiles(root)
  const entry = { at: Date.now(), files, set: new Set(files) }
  lists.set(root, entry)
  return entry
}

/** After a change: the next listing reads the disk again. */
export function forgetWorkspace(root: string): void {
  lists.delete(root)
}
