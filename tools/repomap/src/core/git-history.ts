/**
 * Reads the repository's history for the viewer's History tab → git.json.
 *
 * Everything comes from local git (commits, branches, remotes as last fetched, tags, the working
 * tree), plus merged pull requests recognised from merge and squash messages. When the main remote
 * is on github.com, open and closed pull requests are also read from GitHub's REST API (a cached,
 * read-only request that never fails the build; `history.github: "off"` turns it off).
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  GIT_HISTORY_VERSION,
  type GitCommit,
  type GitFileChange,
  type GitFileStatus,
  type GitHistory,
  type GitHost,
  type GitPullRequest,
  type GitRef,
  type GitRepoInfo,
  type GitSources,
  type GitWorkingTree,
} from '../shared/git-types.ts'
import { sha256 } from './cache.ts'
import type { RepoMapConfig } from './config.ts'
import { color, formatMs, type Logger } from './log.ts'

export interface HistoryOptions {
  name: string
  maxCommits: number
  maxFilesPerCommit: number
  github: 'auto' | 'off'
  githubCacheMinutes: number
  maxPullRequests: number
  /** Leave the working tree out (for publishing). */
  publicOutput?: boolean
  /** Folder for the cached GitHub answer. */
  cacheDir?: string
  /** The last git.json: its commits are reused while the refs are unchanged. */
  previous?: GitHistory
  log?: Logger
  /** Injected in tests. */
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
  /** The GitHub CLI, used to borrow its token when no GITHUB_TOKEN is set (null: don't). */
  ghCommand?: string | null
  now?: () => number
}

const FIELD = '\x1f'
const RECORD = '\x1e'
const LIST = '\x1d'
const MAX_WORKTREE_FILES = 300

function run(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolveRun, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } }, (error, stdout) => {
      if (error) reject(error)
      else resolveRun(stdout)
    })
  })
}

async function tryRun(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    return await run(cwd, args)
  } catch {
    return undefined
  }
}

/** The history of the repository at `repoRoot`, or undefined when it isn't a git repository. */
export async function readGitHistory(repoRoot: string, options: HistoryOptions): Promise<GitHistory | undefined> {
  const inside = await tryRun(repoRoot, ['rev-parse', '--is-inside-work-tree'])
  if (inside?.trim() !== 'true') return undefined

  const [refsText, headBranch, headCommit, remotesText] = await Promise.all([
    tryRun(repoRoot, [
      'for-each-ref',
      '--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(upstream)%00%(upstream:track,nobracket)%00%(contents:subject)',
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ]),
    tryRun(repoRoot, ['symbolic-ref', '-q', '--short', 'HEAD']),
    tryRun(repoRoot, ['rev-parse', '-q', '--verify', 'HEAD^{commit}']),
    tryRun(repoRoot, ['config', '--get-regexp', '^remote\\..*\\.url$']),
  ])

  const remotes = parseRemotes(remotesText ?? '')
  const mainRemote = remotes.find((r) => r.name === 'origin') ?? remotes[0]
  const refs = parseRefs(refsText ?? '', remotes.map((r) => r.name))
  const head = headCommit?.trim() ? { branch: headBranch?.trim() || undefined, commit: headCommit.trim() } : undefined
  const defaultBranch = await findDefaultBranch(repoRoot, mainRemote?.name, refs)

  // Commits only change when refs do: reuse the previous read while they are the same.
  const fingerprint = sha256(
    [GIT_HISTORY_VERSION, options.maxCommits, options.maxFilesPerCommit, refsText ?? '', head?.commit ?? '', head?.branch ?? ''].join('\n'),
  )
  let commits: GitCommit[]
  let totalCommits: number | undefined
  const previous = options.previous
  if (previous && previous.fingerprint === fingerprint && previous.version === GIT_HISTORY_VERSION) {
    commits = previous.commits
    totalCommits = previous.totalCommits
    for (const commit of commits) delete commit.pr
  } else {
    const started = performance.now()
    commits = head || refs.length > 0 ? await readCommits(repoRoot, options) : []
    options.log?.debug(`git log: ${commits.length} commits in ${formatMs(performance.now() - started)}`)
    if (commits.length >= options.maxCommits) {
      const count = await tryRun(repoRoot, ['rev-list', '--exclude=refs/stash', '--all', '--count'])
      totalCommits = count ? Number(count.trim()) : undefined
    }
  }

  const repo: GitRepoInfo = {
    name: options.name,
    head,
    defaultBranch,
    remotes: remotes.map((r) => ({ name: r.name, url: r.url })),
    web: mainRemote ? webFromRemote(mainRemote.url) : undefined,
  }
  if (!repo.head) delete repo.head
  if (!repo.defaultBranch) delete repo.defaultBranch
  if (!repo.web) delete repo.web

  const sources: GitSources = { pullRequests: ['messages'] }
  let pullRequests = detectPullRequests(commits)
  if (options.github === 'auto' && repo.web?.host === 'github') {
    const github = await githubPullRequests(repo.web.url, options)
    if (github) {
      sources.pullRequests.push('github')
      sources.github = { fetchedAt: github.fetchedAt, ...(github.error ? { error: github.error } : {}) }
      if (!github.fetchedAt) delete sources.github.fetchedAt
      pullRequests = mergePullRequests(pullRequests, github.pulls, new Set(commits.map((c) => c.hash)))
    }
  }
  const byHash = new Map(commits.map((c) => [c.hash, c]))
  for (const pr of pullRequests) {
    const commit = pr.state === 'merged' && pr.mergeCommit ? byHash.get(pr.mergeCommit) : undefined
    if (commit && commit.pr === undefined) commit.pr = pr.number
  }

  const history: GitHistory = {
    kind: 'repomap-git',
    version: GIT_HISTORY_VERSION,
    generatedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    repo,
    commits,
    refs,
    pullRequests,
    sources,
    fingerprint,
  }
  if (!options.publicOutput) {
    const workingTree = await readWorkingTree(repoRoot)
    if (workingTree) history.workingTree = workingTree
  }
  if (totalCommits !== undefined && totalCommits > commits.length) {
    history.truncated = true
    history.totalCommits = totalCommits
  }
  return history
}

// ---------------------------------------------------------------- commits

async function readCommits(repoRoot: string, options: HistoryOptions): Promise<GitCommit[]> {
  const format = ['%H', '%P', '%an', '%at', '%cn', '%ct', '%s', '%b', `%(trailers:key=Co-authored-by,valueonly,separator=%x1d)`].join('%x1f')
  const out = await tryRun(repoRoot, [
    '-c',
    'diff.renameLimit=2000',
    'log',
    '--exclude=refs/stash',
    '--all',
    '--date-order',
    `--max-count=${options.maxCommits}`,
    '-z',
    `--format=%x1e${format}%x1f`,
    '--raw',
    '--numstat',
    '-M',
    '--diff-merges=first-parent',
    '--no-ext-diff',
    '--no-textconv',
    '--no-color',
    '--no-show-signature',
  ])
  if (!out) return []
  return parseLog(out, options.maxFilesPerCommit)
}

/** Parses `git log -z --raw --numstat` output with the record format of readCommits. */
export function parseLog(out: string, maxFiles = Infinity): GitCommit[] {
  const commits: GitCommit[] = []
  for (const record of out.split(RECORD)) {
    if (!record.trim()) continue
    const fields = record.split(FIELD)
    if (fields.length < 10) continue
    const [hash, parents, author, authorTime, committer, commitTime, subject, body, trailers] = fields
    const tail = fields.slice(9).join(FIELD)
    const commit: GitCommit = {
      hash,
      parents: parents.trim() ? parents.trim().split(' ') : [],
      author,
      date: Number(authorTime),
      subject,
    }
    if (committer && committer !== author) commit.committer = committer
    if (Number(commitTime) !== commit.date) commit.committedAt = Number(commitTime)
    const text = body.trim()
    if (text) commit.body = text
    const coAuthors = trailers
      .split(LIST)
      .map((value) => value.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean)
    if (coAuthors.length > 0) commit.coAuthors = [...new Set(coAuthors)]
    const files = parseChanges(tail)
    if (files.length > 0) {
      let additions = 0
      let deletions = 0
      for (const file of files) {
        additions += file.additions ?? 0
        deletions += file.deletions ?? 0
      }
      commit.stats = { files: files.length, additions, deletions }
      commit.files = files.slice(0, maxFiles)
      if (files.length > maxFiles) commit.filesOmitted = files.length - maxFiles
    }
    commits.push(commit)
  }
  return commits
}

/** The `--raw` (status) and `--numstat` (line counts) entries of one commit, joined by path. */
function parseChanges(tail: string): GitFileChange[] {
  const tokens = tail.split('\0')
  const files: GitFileChange[] = []
  const byPath = new Map<string, GitFileChange>()
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i].replace(/^\n+/, '')
    if (token === '') {
      i++
      continue
    }
    if (token.startsWith(':')) {
      const status = token.split(' ').pop() ?? 'M'
      const letter = (status[0] ?? 'M') as GitFileStatus
      let change: GitFileChange
      if (letter === 'R' || letter === 'C') {
        change = { path: tokens[i + 2] ?? '', status: letter, from: tokens[i + 1] }
        i += 3
      } else {
        change = { path: tokens[i + 1] ?? '', status: letter }
        i += 2
      }
      if (!change.path) continue
      files.push(change)
      byPath.set(change.path, change)
      continue
    }
    const numstat = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(token)
    if (numstat) {
      let path = numstat[3]
      if (path === '') {
        path = tokens[i + 2] ?? ''
        i += 3
      } else {
        i += 1
      }
      const change = byPath.get(path)
      if (change && numstat[1] !== '-') {
        change.additions = Number(numstat[1])
        change.deletions = Number(numstat[2])
      }
      continue
    }
    i++
  }
  return files
}

// ---------------------------------------------------------------- refs, remotes, working tree

interface Remote {
  name: string
  url: string
}

export function parseRemotes(text: string): Remote[] {
  const remotes: Remote[] = []
  for (const line of text.split('\n')) {
    const match = /^remote\.(.+)\.url\s+(.+)$/.exec(line.trim())
    if (match && !remotes.some((r) => r.name === match[1])) remotes.push({ name: match[1], url: stripCredentials(match[2].trim()) })
  }
  return remotes
}

/** https://user:token@host/x → https://host/x (scp-style git@host:x is left alone: "git" is not a secret). */
export function stripCredentials(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]*@/i, '$1')
}

export function parseRefs(text: string, remoteNames: string[]): GitRef[] {
  const refs: GitRef[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const [refname, object, type, peeled, peeledType, upstream, track, subject] = line.split('\0')
    let ref: GitRef | undefined
    if (refname.startsWith('refs/heads/')) {
      if (type !== 'commit') continue
      ref = { name: refname.slice('refs/heads/'.length), type: 'branch', commit: object }
      if (upstream) ref.upstream = shortRef(upstream)
      if (track === 'gone') ref.gone = true
      const ahead = /ahead (\d+)/.exec(track ?? '')
      const behind = /behind (\d+)/.exec(track ?? '')
      if (ahead) ref.ahead = Number(ahead[1])
      if (behind) ref.behind = Number(behind[1])
    } else if (refname.startsWith('refs/remotes/')) {
      const name = refname.slice('refs/remotes/'.length)
      if (name.endsWith('/HEAD') || type !== 'commit') continue
      if (remoteNames.length > 0 && !remoteNames.some((remote) => name.startsWith(`${remote}/`))) continue
      ref = { name, type: 'remote', commit: object }
    } else if (refname.startsWith('refs/tags/')) {
      const name = refname.slice('refs/tags/'.length)
      if (type === 'commit') ref = { name, type: 'tag', commit: object }
      else if (type === 'tag' && peeledType === 'commit') {
        ref = { name, type: 'tag', commit: peeled }
        if (subject) ref.message = subject
      }
    }
    if (ref) refs.push(ref)
  }
  return refs
}

function shortRef(refname: string): string {
  return refname.replace(/^refs\/(heads|remotes|tags)\//, '')
}

async function findDefaultBranch(repoRoot: string, remote: string | undefined, refs: GitRef[]): Promise<string | undefined> {
  if (remote) {
    const target = await tryRun(repoRoot, ['symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`])
    const name = target?.trim()
    if (name?.startsWith(`${remote}/`)) return name.slice(remote.length + 1)
  }
  for (const candidate of ['main', 'master', 'trunk', 'develop']) {
    if (refs.some((r) => r.type === 'branch' && r.name === candidate)) return candidate
  }
  return undefined
}

/** The hosting service's web page for a remote URL (https, ssh or scp-style). */
export function webFromRemote(url: string): { host: GitHost; url: string } | undefined {
  let host: string
  let path: string
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(url)
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    host = scp[1]
    path = scp[2]
  } else {
    try {
      const parsed = new URL(url)
      if (!/^(https?|ssh|git):$/.test(parsed.protocol)) return undefined
      host = parsed.hostname
      path = parsed.pathname
    } catch {
      return undefined
    }
  }
  path = path.replace(/^\/+/, '').replace(/\.git\/?$/, '').replace(/\/+$/, '')
  if (!host || !path) return undefined
  const lower = host.toLowerCase()
  if (lower === 'github.com' || lower === 'ssh.github.com') return { host: 'github', url: `https://github.com/${path}` }
  if (lower === 'bitbucket.org') return { host: 'bitbucket', url: `https://bitbucket.org/${path}` }
  if (lower === 'ssh.dev.azure.com') {
    // v3/org/project/repo → https://dev.azure.com/org/project/_git/repo
    const [, org, project, repo] = path.split('/')
    return org && project && repo ? { host: 'azure', url: `https://dev.azure.com/${org}/${project}/_git/${repo}` } : undefined
  }
  if (lower === 'dev.azure.com' || lower.endsWith('.visualstudio.com')) return { host: 'azure', url: `https://${host}/${path.replace(/^[^/]+@/, '')}` }
  if (lower === 'gitlab.com' || lower.startsWith('gitlab.')) return { host: 'gitlab', url: `https://${host}/${path}` }
  return { host: 'other', url: `https://${host}/${path}` }
}

async function readWorkingTree(repoRoot: string): Promise<GitWorkingTree | undefined> {
  const out = await tryRun(repoRoot, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=normal'])
  if (!out) return undefined
  return parseStatus(out)
}

export function parseStatus(out: string): GitWorkingTree | undefined {
  const tree: GitWorkingTree = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [] }
  const tokens = out.split('\0')
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i]
    if (entry.length < 4) continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    // Renames and copies are followed by the old path.
    if (x === 'R' || x === 'C') i++
    const code = x + y
    if (code === '??') tree.untracked++
    else if (x === 'U' || y === 'U' || code === 'AA' || code === 'DD') tree.conflicted++
    else {
      if (x !== ' ') tree.staged++
      if (y !== ' ') tree.unstaged++
    }
    if (tree.files.length < MAX_WORKTREE_FILES) tree.files.push({ path, status: code })
  }
  return tree.files.length > 0 ? tree : undefined
}

// ---------------------------------------------------------------- pull requests

const GITHUB_MERGE = /^Merge pull request #(\d+) from (\S+)/
const BITBUCKET_MERGE = /^Merged in (\S+) \(pull request #(\d+)\)/
const AZURE_MERGE = /^Merged PR (\d+): (.+)$/
const GITLAB_MERGE = /^Merge branch '([^']+)' into '([^']+)'/
const GITLAB_REQUEST = /See merge request \S*!(\d+)/
const SQUASH = /^(.+?)\s+\(#(\d+)\)$/

/** Pull requests that can be read off merge commits and squash-merge subjects. */
export function detectPullRequests(commits: GitCommit[]): GitPullRequest[] {
  const found = new Map<number, GitPullRequest>()
  const add = (pr: GitPullRequest) => {
    if (!found.has(pr.number)) found.set(pr.number, pr)
  }
  for (const commit of commits) {
    const merge = commit.parents.length > 1
    const firstLine = commit.body?.split('\n').find((line) => line.trim())?.trim()
    let match: RegExpExecArray | null
    if (merge && (match = GITHUB_MERGE.exec(commit.subject))) {
      // "owner/branch" (or "owner:branch" from older versions): the branch is what follows the owner.
      const source = match[2].replace(/^[^/:]+[/:]/, '')
      add({ number: Number(match[1]), title: firstLine ?? commit.subject, state: 'merged', source, mergeCommit: commit.hash, origin: 'merge-message', mergedAt: iso(commit.committedAt ?? commit.date) })
    } else if (merge && (match = BITBUCKET_MERGE.exec(commit.subject))) {
      add({ number: Number(match[2]), title: firstLine ?? commit.subject, state: 'merged', source: match[1], mergeCommit: commit.hash, origin: 'merge-message', mergedAt: iso(commit.committedAt ?? commit.date) })
    } else if ((match = AZURE_MERGE.exec(commit.subject))) {
      add({ number: Number(match[1]), title: match[2], state: 'merged', mergeCommit: commit.hash, origin: 'merge-message', mergedAt: iso(commit.committedAt ?? commit.date) })
    } else if (merge && GITLAB_MERGE.test(commit.subject) && (match = GITLAB_REQUEST.exec(commit.body ?? ''))) {
      const branches = GITLAB_MERGE.exec(commit.subject)!
      add({
        number: Number(match[1]),
        title: firstLine && !GITLAB_REQUEST.test(firstLine) ? firstLine : commit.subject,
        state: 'merged',
        source: branches[1],
        target: branches[2],
        mergeCommit: commit.hash,
        origin: 'merge-message',
        mergedAt: iso(commit.committedAt ?? commit.date),
      })
    } else if (!merge && (match = SQUASH.exec(commit.subject))) {
      add({ number: Number(match[2]), title: match[1], state: 'merged', mergeCommit: commit.hash, origin: 'squash-message', mergedAt: iso(commit.committedAt ?? commit.date) })
    }
  }
  return [...found.values()].sort((a, b) => b.number - a.number)
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

/** Hosting data wins for titles, states and branches; the local merge commit fills in what it lacks. */
export function mergePullRequests(local: GitPullRequest[], remote: GitPullRequest[], known: Set<string>): GitPullRequest[] {
  const byNumber = new Map(local.map((pr) => [pr.number, pr]))
  for (const pr of remote) {
    const existing = byNumber.get(pr.number)
    const merged: GitPullRequest = { ...existing, ...pr }
    // The API's merge commit may be one we don't have (not fetched, or a test merge for open PRs).
    if (!pr.mergeCommit || !known.has(pr.mergeCommit)) {
      if (existing?.mergeCommit) merged.mergeCommit = existing.mergeCommit
      else delete merged.mergeCommit
    }
    if (pr.state !== 'merged' && merged.mergeCommit && !existing) delete merged.mergeCommit
    byNumber.set(pr.number, merged)
  }
  return [...byNumber.values()].sort((a, b) => b.number - a.number)
}

interface GithubCache {
  repo: string
  fetchedAt: string
  pulls: GitPullRequest[]
}

interface ApiPull {
  number: number
  title: string
  state: 'open' | 'closed'
  draft?: boolean
  merged_at: string | null
  closed_at: string | null
  created_at: string
  merge_commit_sha: string | null
  html_url: string
  user: { login: string } | null
  head: { ref: string; sha: string }
  base: { ref: string }
}

/** Pull requests from api.github.com, cached for `githubCacheMinutes`; on failure the last answer is reused. */
async function githubPullRequests(webUrl: string, options: HistoryOptions): Promise<{ pulls: GitPullRequest[]; fetchedAt?: string; error?: string } | undefined> {
  const slug = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(webUrl)?.[1]
  if (!slug) return undefined
  const now = options.now?.() ?? Date.now()
  const cachePath = options.cacheDir ? join(options.cacheDir, '_github-pulls.json') : undefined
  let cached: GithubCache | undefined
  if (cachePath && existsSync(cachePath)) {
    try {
      cached = JSON.parse(readFileSync(cachePath, 'utf8')) as GithubCache
      if (cached.repo !== slug) cached = undefined
    } catch {
      cached = undefined
    }
  }
  if (cached && now - Date.parse(cached.fetchedAt) < options.githubCacheMinutes * 60_000) {
    return { pulls: cached.pulls, fetchedAt: cached.fetchedAt }
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  try {
    const token = await githubToken(options)
    const pulls: GitPullRequest[] = []
    const perPage = 100
    const pages = Math.max(1, Math.ceil(options.maxPullRequests / perPage))
    for (let page = 1; page <= pages; page++) {
      const response = await fetchImpl(`https://api.github.com/repos/${slug}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}&page=${page}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'repomap',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) {
        const reason =
          response.status === 404
            ? 'repository not found (private? set GITHUB_TOKEN)'
            : response.status === 403 || response.status === 429
              ? 'rate limited (set GITHUB_TOKEN)'
              : `HTTP ${response.status}`
        throw new Error(reason)
      }
      const batch = (await response.json()) as ApiPull[]
      for (const pull of batch) pulls.push(fromApi(pull))
      if (batch.length < perPage) break
    }
    const fetchedAt = new Date(now).toISOString()
    if (cachePath) {
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, JSON.stringify({ repo: slug, fetchedAt, pulls } satisfies GithubCache))
    }
    options.log?.debug(`github: ${pulls.length} pull requests for ${slug}`)
    return { pulls, fetchedAt }
  } catch (error) {
    const message = (error as Error).name === 'TimeoutError' ? 'timed out' : (error as Error).message
    options.log?.debug(`github: ${message}`)
    return cached ? { pulls: cached.pulls, fetchedAt: cached.fetchedAt, error: message } : { pulls: [], error: message }
  }
}

function fromApi(pull: ApiPull): GitPullRequest {
  const pr: GitPullRequest = {
    number: pull.number,
    title: pull.title,
    state: pull.merged_at ? 'merged' : pull.state === 'open' ? 'open' : 'closed',
    source: pull.head?.ref,
    target: pull.base?.ref,
    author: pull.user?.login,
    url: pull.html_url,
    headCommit: pull.head?.sha,
    createdAt: pull.created_at,
    origin: 'github',
  }
  if (pull.merged_at) {
    pr.mergedAt = pull.merged_at
    if (pull.merge_commit_sha) pr.mergeCommit = pull.merge_commit_sha
  }
  if (pull.closed_at) pr.closedAt = pull.closed_at
  if (pull.draft) pr.draft = true
  return pr
}

async function githubToken(options: HistoryOptions): Promise<string | undefined> {
  const env = options.env ?? process.env
  const fromEnv = env.GITHUB_TOKEN || env.GH_TOKEN
  if (fromEnv) return fromEnv
  const gh = options.ghCommand === undefined ? 'gh' : options.ghCommand
  if (!gh) return undefined
  return new Promise((resolveToken) => {
    execFile(gh, ['auth', 'token'], { timeout: 3000, encoding: 'utf8' }, (error, stdout) => resolveToken(error ? undefined : stdout.trim() || undefined))
  })
}

// ---------------------------------------------------------------- git.json

export interface HistoryResult {
  path: string
  changed: boolean
  history?: GitHistory
}

export function gitHistoryPath(config: RepoMapConfig): string {
  return join(dirname(config.output), 'git.json')
}

/** The history published next to a graph file: name.graph.json → name.git.json, else git.json beside it. */
export function historyBeside(graphPath: string): string {
  const named = graphPath.replace(/\.graph\.json$/, '.git.json')
  return named !== graphPath && existsSync(named) ? named : join(dirname(graphPath), 'git.json')
}

export function readGitHistoryFile(path: string): GitHistory | undefined {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as GitHistory
  } catch {
    return undefined
  }
}

/** Reads the history and rewrites git.json when something in it changed. */
export async function updateGitHistory(config: RepoMapConfig, options: { log: Logger; publicOutput?: boolean }): Promise<HistoryResult> {
  const path = gitHistoryPath(config)
  if (!config.history.enabled) return { path, changed: false }
  const started = performance.now()
  const previous = readGitHistoryFile(path)
  // Before reading: the previous commits may be reused (and their PR numbers reassigned) in place.
  const before = previous ? stableJson(previous) : undefined
  const history = await readGitHistory(config.repoRoot, {
    name: config.name,
    ...config.history,
    publicOutput: options.publicOutput,
    cacheDir: join(dirname(config.output), 'cache'),
    previous,
    log: options.log,
  })
  if (!history) {
    options.log.debug('history: not a git repository')
    return { path, changed: false }
  }
  const changed = before !== stableJson(history)
  if (changed) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(history)}\n`)
  }
  const prs = history.pullRequests.length
  const githubError = history.sources?.github?.error
  options.log.step(
    `history ${color.bold(`${history.commits.length} commits`)}, ${history.refs.length} refs${prs ? `, ${prs} pull requests` : ''}${
      githubError ? color.yellow(` (GitHub: ${githubError})`) : ''
    } ${color.dim(formatMs(performance.now() - started))}`,
  )
  return { path, changed, history }
}

/** The content without timestamps that change on every read. */
function stableJson(history: GitHistory): string {
  const github = history.sources?.github
  return JSON.stringify({
    ...history,
    generatedAt: undefined,
    sources: history.sources && { ...history.sources, github: github && { ...github, fetchedAt: undefined } },
  })
}
