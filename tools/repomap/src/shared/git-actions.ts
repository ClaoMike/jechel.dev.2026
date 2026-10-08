/**
 * The git commands the History tab can run through `repomap serve` (POST /api/git), and the live
 * state of the repository it shows next to them (GET /api/git/state). Isomorphic: the server runs
 * them (src/core/git-actions.ts), the viewer builds them.
 */

/** A file with uncommitted changes. `x`/`y`: index/worktree status as in `git status --porcelain` ("." = unchanged, "?" = untracked). */
export interface LiveFile {
  path: string
  /** Renames: the old path. */
  from?: string
  x: string
  y: string
  conflicted?: boolean
}

export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert'

export interface GitLiveState {
  /** Checked-out branch; absent when HEAD is detached. */
  branch?: string
  /** Commit of HEAD; absent before the first commit. */
  head?: string
  /** e.g. "origin/main". */
  upstream?: string
  ahead: number
  behind: number
  /** The upstream branch was deleted on the remote. */
  upstreamGone?: boolean
  /** Where "Publish branch" pushes: origin, else the first remote. */
  remote?: string
  files: LiveFile[]
  stashes: { index: number; message: string; date: number }[]
  /** A merge, rebase, cherry-pick or revert waiting for conflicts to be resolved. */
  operation?: GitOperation
}

export type ResetMode = 'soft' | 'mixed' | 'hard'
export type CheckoutTarget = 'branch' | 'remote' | 'commit'

export type GitAction =
  | { type: 'fetch' }
  | { type: 'pull' }
  /** Pushes the current branch; publishes it (push -u) when it has no upstream. */
  | { type: 'push'; force?: boolean }
  /** Commits exactly these files (like GitHub Desktop's checkboxes), whatever is staged. */
  | { type: 'commit'; summary: string; description?: string; files: string[]; amend?: boolean }
  /** Takes the last commit back into the working tree (soft reset). */
  | { type: 'undo-commit' }
  | { type: 'discard'; files: string[] }
  | { type: 'stash'; message?: string }
  | { type: 'stash-pop'; index: number }
  | { type: 'stash-apply'; index: number }
  | { type: 'stash-drop'; index: number }
  /** A local branch, a remote branch (checked out as a local branch tracking it), or a commit (detached). */
  | { type: 'checkout'; ref: string; target: CheckoutTarget }
  | { type: 'create-branch'; name: string; from?: string; checkout: boolean }
  | { type: 'rename-branch'; from: string; to: string }
  | { type: 'delete-branch'; name: string; force?: boolean }
  /** Deletes a branch on its remote, e.g. "origin/feature/x". */
  | { type: 'delete-remote-branch'; name: string }
  /** Merges a branch or commit into the current branch (squash: as one new commit). */
  | { type: 'merge'; ref: string; squash?: boolean }
  | { type: 'rebase'; onto: string }
  /** Gives up the merge/rebase/cherry-pick/revert in progress. */
  | { type: 'abort' }
  /** Conflicts resolved: stages everything and finishes the merge/rebase/cherry-pick/revert. */
  | { type: 'continue' }
  | { type: 'cherry-pick'; commit: string }
  | { type: 'revert'; commit: string }
  | { type: 'reset'; commit: string; mode: ResetMode }
  | { type: 'create-tag'; name: string; commit: string; message?: string }
  | { type: 'delete-tag'; name: string }
  | { type: 'push-tag'; name: string }

export type GitActionType = GitAction['type']

export type GitActionResult =
  | { ok: true; message: string; output: string; state: GitLiveState }
  | { ok: false; error: string; output?: string; state?: GitLiveState }

/** Header every writing request carries: browsers can't send it cross-origin without a CORS preflight, which the server never grants. */
export const WRITE_HEADER = 'X-Repomap-Request'

/** Actions that talk to the remote (they take longer and may need credentials). */
export const NETWORK_ACTIONS: ReadonlySet<GitActionType> = new Set(['fetch', 'pull', 'push', 'delete-remote-branch', 'push-tag'])

/** What the viewer shows while an action runs. */
export function actionProgress(action: GitAction): string {
  switch (action.type) {
    case 'fetch':
      return 'Fetching…'
    case 'pull':
      return 'Pulling…'
    case 'push':
      return action.force ? 'Force pushing…' : 'Pushing…'
    case 'commit':
      return action.amend ? 'Amending…' : 'Committing…'
    case 'undo-commit':
      return 'Undoing the commit…'
    case 'discard':
      return 'Discarding…'
    case 'stash':
      return 'Stashing…'
    case 'stash-pop':
    case 'stash-apply':
      return 'Restoring the stash…'
    case 'stash-drop':
      return 'Dropping the stash…'
    case 'checkout':
      return `Switching to ${action.ref}…`
    case 'create-branch':
      return `Creating ${action.name}…`
    case 'rename-branch':
      return `Renaming ${action.from}…`
    case 'delete-branch':
    case 'delete-remote-branch':
      return `Deleting ${action.name}…`
    case 'merge':
      return `Merging ${action.ref}…`
    case 'rebase':
      return `Rebasing onto ${action.onto}…`
    case 'abort':
      return 'Aborting…'
    case 'continue':
      return 'Continuing…'
    case 'cherry-pick':
      return 'Cherry-picking…'
    case 'revert':
      return 'Reverting…'
    case 'reset':
      return 'Resetting…'
    case 'create-tag':
      return `Tagging ${action.name}…`
    case 'delete-tag':
      return `Deleting tag ${action.name}…`
    case 'push-tag':
      return `Pushing tag ${action.name}…`
  }
}

/**
 * Why a branch or tag name is not allowed, or null. The rules of `git check-ref-format`
 * (the server asks git itself as well).
 */
export function refNameProblem(name: string): string | null {
  if (!name.trim()) return 'Enter a name.'
  if (name !== name.trim()) return 'No spaces at the start or end.'
  if (name.startsWith('-')) return 'Cannot start with "-".'
  if (name === '@' || name === 'HEAD') return `"${name}" is reserved.`
  if (/[\s~^:?*[\\\x00-\x1f\x7f]/.test(name)) return 'No spaces or ~ ^ : ? * [ \\.'
  if (name.includes('..')) return 'No "..".'
  if (name.includes('@{')) return 'No "@{".'
  if (name.includes('//') || name.startsWith('/') || name.endsWith('/')) return 'No empty parts between slashes.'
  if (name.endsWith('.') || name.endsWith('.lock')) return 'Cannot end with "." or ".lock".'
  if (name.split('/').some((part) => part.startsWith('.'))) return 'No part can start with ".".'
  return null
}

/** A commit hash (abbreviated or full). */
export function isCommitHash(value: string): boolean {
  return /^[0-9a-f]{4,64}$/i.test(value)
}

/** The first line of a commit message and the rest, as typed in the commit form. */
export function commitMessage(summary: string, description?: string): string {
  const body = description?.trim()
  return `${summary.trim()}\n${body ? `\n${body}\n` : ''}`
}
