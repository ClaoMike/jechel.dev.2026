/**
 * The History tab's pure logic: which commits are shown (reachable from the visible refs), their
 * lanes, ref and pull request badges, search, and "which branches contain this commit".
 */
import { WORKTREE, type GitCommit, type GitHistory, type GitPullRequest, type GitRef } from '../../../src/shared/git-types.ts'
import { layoutLanes, type LaneLayout } from './lanes.ts'

export interface GitFilters {
  /** Refs hidden one by one, as refKey()s. */
  hiddenRefs: string[]
  remotes: boolean
  tags: boolean
  /** The "uncommitted changes" row. */
  worktree: boolean
}

export const DEFAULT_FILTERS: GitFilters = { hiddenRefs: [], remotes: true, tags: true, worktree: true }

export interface CommitRow {
  hash: string
  /** Null for the uncommitted changes row. */
  commit: GitCommit | null
}

export interface GitModel {
  history: GitHistory
  rows: CommitRow[]
  rowOf: Map<string, number>
  lanes: LaneLayout
  byHash: Map<string, GitCommit>
  children: Map<string, string[]>
  /** Visible refs by commit. */
  refsAt: Map<string, GitRef[]>
  /** Pull requests by the commit that merged them, or (open and closed ones) their newest commit. */
  prsAt: Map<string, GitPullRequest[]>
  prByNumber: Map<number, GitPullRequest>
  /** Tips of merged branches that no ref points to any more, named from the merge message. */
  ghostAt: Map<string, string>
  visibleRefs: GitRef[]
  /** Commits hidden because only hidden refs reach them. */
  hiddenCommits: number
  /** The trunk: kept in the leftmost lane. */
  mainRef?: GitRef
}

export function refKey(ref: GitRef): string {
  return `${ref.type}:${ref.name}`
}

export function isRefVisible(ref: GitRef, filters: GitFilters): boolean {
  if (ref.type === 'remote' && !filters.remotes) return false
  if (ref.type === 'tag' && !filters.tags) return false
  return !filters.hiddenRefs.includes(refKey(ref))
}

export function buildGitModel(history: GitHistory, filters: GitFilters = DEFAULT_FILTERS): GitModel {
  const byHash = new Map(history.commits.map((c) => [c.hash, c]))
  const children = new Map<string, string[]>()
  for (const commit of history.commits) {
    for (const parent of commit.parents) {
      const list = children.get(parent)
      if (list) list.push(commit.hash)
      else children.set(parent, [commit.hash])
    }
  }

  // ---- Visible commits: everything reachable from a visible ref (all of them when nothing is hidden)
  const visibleRefs = history.refs.filter((ref) => isRefVisible(ref, filters))
  const head = history.repo.head
  let visible: Set<string> | null = null
  if (visibleRefs.length < history.refs.length) {
    visible = new Set()
    const stack = visibleRefs.map((r) => r.commit)
    // A detached HEAD has no ref to hide it with.
    if (head && !head.branch) stack.push(head.commit)
    while (stack.length > 0) {
      const hash = stack.pop()!
      if (visible.has(hash)) continue
      const commit = byHash.get(hash)
      if (!commit) continue
      visible.add(hash)
      for (const parent of commit.parents) stack.push(parent)
    }
  }

  const rows: CommitRow[] = []
  const tree = history.workingTree
  if (tree && filters.worktree && head && (!visible || visible.has(head.commit)) && byHash.has(head.commit)) {
    rows.push({ hash: WORKTREE, commit: null })
  }
  for (const commit of history.commits) if (!visible || visible.has(commit.hash)) rows.push({ hash: commit.hash, commit })
  const rowOf = new Map(rows.map((row, i) => [row.hash, i]))

  // ---- Lanes, with the trunk (default branch, else HEAD) on the left
  const mainRef = findMainRef(history, visibleRefs)
  const reserve = mainRef ? [mainRef.commit] : []
  const lanes = layoutLanes(
    rows.map((row) => ({ hash: row.hash, parents: row.commit ? row.commit.parents : [head!.commit] })),
    reserve,
  )

  // ---- Badges
  const refsAt = new Map<string, GitRef[]>()
  for (const ref of visibleRefs) {
    if (!rowOf.has(ref.commit)) continue
    const list = refsAt.get(ref.commit)
    if (list) list.push(ref)
    else refsAt.set(ref.commit, [ref])
  }
  const prsAt = new Map<string, GitPullRequest[]>()
  const prByNumber = new Map(history.pullRequests.map((pr) => [pr.number, pr]))
  for (const pr of history.pullRequests) {
    const at = pr.state === 'merged' ? (pr.mergeCommit ?? pr.headCommit) : pr.headCommit
    if (!at || !rowOf.has(at)) continue
    const list = prsAt.get(at)
    if (list) list.push(pr)
    else prsAt.set(at, [pr])
  }

  const ghostAt = new Map<string, string>()
  for (const row of rows) {
    const commit = row.commit
    if (!commit || commit.parents.length < 2) continue
    const tip = commit.parents[1]
    if (!rowOf.has(tip) || refsAt.has(tip)) continue
    const name = (commit.pr !== undefined ? prByNumber.get(commit.pr)?.source : undefined) ?? mergedBranch(commit.subject)
    if (name) ghostAt.set(tip, name)
  }

  return {
    history,
    rows,
    rowOf,
    lanes,
    byHash,
    children,
    refsAt,
    prsAt,
    prByNumber,
    ghostAt,
    visibleRefs,
    hiddenCommits: history.commits.length - (rows.length - (rows[0]?.hash === WORKTREE ? 1 : 0)),
    mainRef,
  }
}

function findMainRef(history: GitHistory, refs: GitRef[]): GitRef | undefined {
  const main = history.repo.defaultBranch
  const branch = (name?: string) => (name ? refs.find((r) => r.type === 'branch' && r.name === name) : undefined)
  const remote = main ? refs.find((r) => r.type === 'remote' && r.name.endsWith(`/${main}`)) : undefined
  const local = branch(main)
  if (local && remote && local.commit !== remote.commit) {
    // Of a local branch and its remote, the newer one (it usually contains the other).
    const index = new Map(history.commits.map((c, i) => [c.hash, i]))
    return (index.get(remote.commit) ?? Infinity) < (index.get(local.commit) ?? Infinity) ? remote : local
  }
  return local ?? remote ?? branch(history.repo.head?.branch)
}

/** The branch a merge commit brought in, from its message. */
export function mergedBranch(subject: string): string | undefined {
  let match = /^Merge pull request #\d+ from (\S+)/.exec(subject)
  if (match) return match[1].replace(/^[^/:]+[/:]/, '')
  match = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(subject)
  if (match) return match[1]
  match = /^Merged in (\S+) \(pull request #\d+\)/.exec(subject)
  if (match) return match[1]
  return undefined
}

/** The branch a merge commit merged into, from its message ("Merge branch 'x' into main"). */
export function mergeTarget(subject: string): string | undefined {
  const match = /^Merge (?:remote-tracking )?branch '[^']+'(?: of \S+)? into (\S+)/.exec(subject)
  return match ? match[1].replace(/^'(.*)'$/, '$1') : undefined
}

// ---------------------------------------------------------------- search

/**
 * Whether a commit matches a search: message, author, hash prefix, file path or "#12" (its pull
 * request). Every word must match somewhere; case-insensitive.
 */
export function commitMatches(commit: GitCommit, query: string, model?: GitModel): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const pr = commit.pr !== undefined ? model?.prByNumber.get(commit.pr) : undefined
  const refs = model?.refsAt.get(commit.hash)?.map((r) => r.name).join(' ') ?? ''
  const text = [commit.subject, commit.body ?? '', commit.author, commit.committer ?? '', ...(commit.coAuthors ?? []), pr?.title ?? '', pr?.source ?? '', refs]
    .join('\n')
    .toLowerCase()
  return words.every((word) => {
    if (/^#\d+$/.test(word)) return commit.pr === Number(word.slice(1))
    if (/^[0-9a-f]{4,40}$/.test(word) && commit.hash.startsWith(word)) return true
    if (text.includes(word)) return true
    return commit.files?.some((f) => f.path.toLowerCase().includes(word) || f.from?.toLowerCase().includes(word)) ?? false
  })
}

/** Whether a commit changed a file (or anything under a folder, for paths ending in "/"). */
export function touchesPath(commit: GitCommit, path: string): boolean {
  const folder = path.endsWith('/')
  return (
    commit.files?.some((f) => (folder ? f.path.startsWith(path) || f.from?.startsWith(path) : f.path === path || f.from === path)) ?? false
  )
}

/** Rows matching the search and the file filter (null when neither is set). */
export function findMatches(model: GitModel, query: string, path: string | null): number[] | null {
  const trimmed = query.trim()
  if (!trimmed && !path) return null
  const rows: number[] = []
  model.rows.forEach((row, i) => {
    if (!row.commit) return
    if (path && !touchesPath(row.commit, path)) return
    if (trimmed && !commitMatches(row.commit, trimmed, model)) return
    rows.push(i)
  })
  return rows
}

// ---------------------------------------------------------------- relations

/** Branches and tags whose history includes the commit. */
export function containingRefs(model: GitModel, hash: string): GitRef[] {
  const reached = new Set<string>([hash])
  const stack = [hash]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of model.children.get(current) ?? []) {
      if (reached.has(child)) continue
      reached.add(child)
      stack.push(child)
    }
  }
  return model.history.refs.filter((ref) => reached.has(ref.commit))
}

export interface RefBadge {
  /** Branch name without the remote, or the tag name. */
  label: string
  type: 'branch' | 'tag'
  /** A local branch points here. */
  local: boolean
  /** Remotes whose branch of the same name points here. */
  remotes: string[]
  head: boolean
  refs: GitRef[]
}

/** Local and remote branches of the same name at the same commit share one badge; HEAD's first. */
export function refBadges(refs: GitRef[], remoteNames: string[], headBranch?: string): RefBadge[] {
  const badges = new Map<string, RefBadge>()
  const split = (name: string): [string | undefined, string] => {
    const remote = remoteNames.find((r) => name.startsWith(`${r}/`))
    return remote ? [remote, name.slice(remote.length + 1)] : [undefined, name]
  }
  for (const ref of refs) {
    if (ref.type === 'tag') {
      badges.set(`tag:${ref.name}`, { label: ref.name, type: 'tag', local: false, remotes: [], head: false, refs: [ref] })
      continue
    }
    const [remote, name] = ref.type === 'remote' ? split(ref.name) : [undefined, ref.name]
    const key = `branch:${name}`
    const badge = badges.get(key) ?? { label: name, type: 'branch' as const, local: false, remotes: [], head: false, refs: [] }
    if (remote) badge.remotes.push(remote)
    else {
      badge.local = true
      if (name === headBranch) badge.head = true
    }
    badge.refs.push(ref)
    badges.set(key, badge)
  }
  const rank = (b: RefBadge) => (b.head ? 0 : b.type === 'branch' ? (b.local ? 1 : 2) : 3)
  return [...badges.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}

// ---------------------------------------------------------------- loading

/** Where the history of a graph published at `graphUrl` would be. */
export function historyUrlsFor(graphUrl: string, base: string): string[] {
  const graph = new URL(graphUrl, base)
  const urls: string[] = []
  if (/\.graph\.json$/.test(graph.pathname)) {
    const sibling = new URL(graph.href)
    sibling.pathname = graph.pathname.replace(/\.graph\.json$/, '.git.json')
    urls.push(sibling.href)
  }
  const plain = new URL('git.json', graph).href
  if (!urls.includes(plain)) urls.push(plain)
  return urls
}

// ---------------------------------------------------------------- formatting

export function shortHash(hash: string): string {
  return hash === WORKTREE ? '' : hash.slice(0, 7)
}

const MINUTE = 60
const HOUR = 3600
const DAY = 86_400

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", "12 Sep", "12 Sep 2024". */
export function relativeTime(seconds: number, now = Date.now() / 1000): string {
  const delta = Math.max(0, now - seconds)
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} min ago`
  if (delta < DAY) return `${Math.floor(delta / HOUR)} h ago`
  if (delta < 2 * DAY) return 'yesterday'
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)} days ago`
  const date = new Date(seconds * 1000)
  const sameYear = date.getFullYear() === new Date(now * 1000).getFullYear()
  return date.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fullDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function initials(name: string): string {
  const words = name.replace(/\[bot\]$/, '').split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase()
}
