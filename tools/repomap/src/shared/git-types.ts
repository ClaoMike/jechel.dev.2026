/**
 * The git.json contract: the repository history shown in the viewer's History tab.
 * Written by `repomap build` (src/core/git-history.ts), read by the viewer. Isomorphic.
 */

/** Version of the git.json format. Bump on breaking changes. */
export const GIT_HISTORY_VERSION = 1

/** Pseudo commit hash of the uncommitted changes row. */
export const WORKTREE = 'WORKTREE'

export type GitHost = 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'other'

export interface GitHistory {
  /** Marks the file type, so a dropped file can be told apart from a graph.json. */
  kind: 'repomap-git'
  version: number
  generatedAt: string
  repo: GitRepoInfo
  /** Newest first; a commit always comes before its parents. */
  commits: GitCommit[]
  refs: GitRef[]
  pullRequests: GitPullRequest[]
  /** Uncommitted changes when the history was read (absent when clean or published). */
  workingTree?: GitWorkingTree
  /** Older commits were left out (see `totalCommits`). */
  truncated?: boolean
  totalCommits?: number
  /** Where the pull requests came from. */
  sources?: GitSources
  /** Hash of refs + options: the commits are reused while it is unchanged. */
  fingerprint?: string
}

export interface GitRepoInfo {
  name: string
  /** Checked-out branch; absent when HEAD is detached. */
  head?: { branch?: string; commit: string }
  /** The remote's default branch (e.g. "main"), from refs/remotes/origin/HEAD. */
  defaultBranch?: string
  /** Remote URLs with credentials removed. */
  remotes: { name: string; url: string }[]
  /** Web page of the main remote, for links to commits and pull requests. */
  web?: { host: GitHost; url: string }
}

export interface GitCommit {
  /** Full hash. */
  hash: string
  parents: string[]
  author: string
  /** Author date, Unix seconds. */
  date: number
  /** Only when different from the author (e.g. merged through a web UI, or rebased). */
  committer?: string
  /** Committer date, Unix seconds, only when different from `date`. */
  committedAt?: number
  subject: string
  /** Message after the subject line, trimmed; trailers included. */
  body?: string
  /** Names from Co-authored-by trailers. */
  coAuthors?: string[]
  /** Totals over all changed files (merge commits: against the first parent). */
  stats?: { files: number; additions: number; deletions: number }
  files?: GitFileChange[]
  /** Files left out of `files` (very large commits). */
  filesOmitted?: number
  /** Pull request this commit merged (merge commit, or a squashed "Title (#12)" commit). */
  pr?: number
}

export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X'

export interface GitFileChange {
  path: string
  status: GitFileStatus
  /** Renames and copies: the old path. */
  from?: string
  /** Absent for binary files. */
  additions?: number
  deletions?: number
}

export type GitRefType = 'branch' | 'remote' | 'tag'

export interface GitRef {
  /** Short name: "main", "origin/main", "v1.2.0". */
  name: string
  type: GitRefType
  /** The commit it points to (annotated tags are peeled). */
  commit: string
  /** Local branches: the branch they track, e.g. "origin/main". */
  upstream?: string
  ahead?: number
  behind?: number
  /** The upstream branch was deleted on the remote. */
  gone?: boolean
  /** Annotated tags: the tag message's first line. */
  message?: string
}

export type PullRequestState = 'open' | 'merged' | 'closed'

export interface GitPullRequest {
  number: number
  title: string
  state: PullRequestState
  /** Head (source) branch. */
  source?: string
  /** Base (target) branch. */
  target?: string
  author?: string
  url?: string
  /** The commit that landed it: a merge commit, or the squashed commit. */
  mergeCommit?: string
  /** The newest commit of the PR branch. */
  headCommit?: string
  createdAt?: string
  mergedAt?: string
  closedAt?: string
  draft?: boolean
  /** How it was found: a merge message, a "(#12)" squash subject, or the hosting API. */
  origin: 'merge-message' | 'squash-message' | 'github'
}

export interface GitWorkingTree {
  staged: number
  unstaged: number
  untracked: number
  conflicted: number
  /** Up to 300 entries. `status` is git's two-letter porcelain code, e.g. " M", "A ", "??". */
  files: { path: string; status: string }[]
}

export interface GitSources {
  pullRequests: ('messages' | 'github')[]
  github?: {
    fetchedAt?: string
    /** Why the last request failed (the previous answer is used when there is one). */
    error?: string
  }
}

/** A short explanation when the value is not a git.json this viewer can read, else null. */
export function checkGitHistory(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Not a JSON object.'
  const history = value as Partial<GitHistory>
  if (history.kind !== 'repomap-git') return 'Not a repomap git.json (missing "kind": "repomap-git").'
  if (typeof history.version !== 'number') return 'Missing "version".'
  if (history.version > GIT_HISTORY_VERSION) return `git.json version ${history.version} is newer than this viewer supports (${GIT_HISTORY_VERSION}).`
  if (!history.repo || typeof history.repo.name !== 'string') return 'Missing "repo".'
  if (!Array.isArray(history.commits) || !Array.isArray(history.refs) || !Array.isArray(history.pullRequests)) return 'Missing "commits", "refs" or "pullRequests".'
  for (const commit of history.commits.slice(0, 50)) {
    if (!commit || typeof commit.hash !== 'string' || !Array.isArray(commit.parents) || typeof commit.date !== 'number') return 'Commits need hash, parents and date.'
  }
  return null
}

/** Links to the hosting service's pages, when the main remote is a known host. */
export function commitUrl(web: GitRepoInfo['web'], hash: string): string | undefined {
  if (!web) return undefined
  switch (web.host) {
    case 'github':
      return `${web.url}/commit/${hash}`
    case 'gitlab':
      return `${web.url}/-/commit/${hash}`
    case 'bitbucket':
      return `${web.url}/commits/${hash}`
    case 'azure':
      return `${web.url}/commit/${hash}`
    default:
      return undefined
  }
}

export function pullRequestUrl(web: GitRepoInfo['web'], number: number): string | undefined {
  if (!web) return undefined
  switch (web.host) {
    case 'github':
      return `${web.url}/pull/${number}`
    case 'gitlab':
      return `${web.url}/-/merge_requests/${number}`
    case 'bitbucket':
      return `${web.url}/pull-requests/${number}`
    case 'azure':
      return `${web.url}/pullrequest/${number}`
    default:
      return undefined
  }
}

export function branchUrl(web: GitRepoInfo['web'], branch: string): string | undefined {
  if (!web) return undefined
  switch (web.host) {
    case 'github':
      return `${web.url}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
    case 'gitlab':
      return `${web.url}/-/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
    case 'bitbucket':
      return `${web.url}/branch/${encodeURIComponent(branch)}`
    case 'azure':
      return `${web.url}?version=GB${encodeURIComponent(branch)}`
    default:
      return undefined
  }
}

/** The hosting service's page for opening a pull request from `head` into `base`. */
export function newPullRequestUrl(web: GitRepoInfo['web'], base: string, head: string): string | undefined {
  if (!web) return undefined
  const b = encodeURIComponent(base)
  const h = encodeURIComponent(head)
  switch (web.host) {
    case 'github':
      return `${web.url}/compare/${base.split('/').map(encodeURIComponent).join('/')}...${head.split('/').map(encodeURIComponent).join('/')}?expand=1`
    case 'gitlab':
      return `${web.url}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${h}&merge_request%5Btarget_branch%5D=${b}`
    case 'bitbucket':
      return `${web.url}/pull-requests/new?source=${h}&dest=${b}`
    case 'azure':
      return `${web.url}/pullrequestcreate?sourceRef=${h}&targetRef=${b}`
    default:
      return undefined
  }
}
