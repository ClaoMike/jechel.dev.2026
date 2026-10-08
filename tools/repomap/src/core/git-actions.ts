/**
 * Runs the History tab's git commands (commit, push, pull, fetch, branches, merges, tags, stashes…)
 * in the served repository, and reads its live state.
 *
 * Every argument is checked before git sees it: names must pass `git check-ref-format`, commits must
 * be hashes, and the files to commit or discard must be ones git reports as changed. git runs without
 * a shell, never prompts (no terminal, no editor), and one command runs at a time per repository.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import {
  commitMessage,
  isCommitHash,
  NETWORK_ACTIONS,
  refNameProblem,
  type GitAction,
  type GitActionResult,
  type GitLiveState,
  type GitOperation,
  type LiveFile,
} from '../shared/git-actions.ts'

const LOCAL_TIMEOUT = 60_000
const NETWORK_TIMEOUT = 180_000

/** A failed git command, with what git said. */
export class GitCommandError extends Error {
  readonly output: string
  constructor(message: string, output = '') {
    super(message)
    this.output = output
  }
}

/** A request that makes no sense (bad name, unknown file…): answered with 400, git never runs. */
export class GitRequestError extends Error {}

interface RunOptions {
  input?: string
  timeout?: number
}

function git(cwd: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: options.timeout ?? LOCAL_TIMEOUT,
        killSignal: 'SIGKILL',
        env: {
          ...process.env,
          LC_ALL: 'C',
          // Never wait for someone to type: no credential prompts, no editors.
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_EDITOR: 'true',
          GIT_SEQUENCE_EDITOR: 'true',
          GIT_MERGE_AUTOEDIT: 'no',
        },
      },
      (error, stdout, stderr) => {
        if (!error) return resolveRun(stdout)
        const output = `${stdout}${stderr}`.trim()
        const timedOut = (error as { killed?: boolean }).killed
        reject(new GitCommandError(timedOut ? `git ${args[0]} took too long and was stopped` : firstMeaningfulLine(output) || error.message, output))
      },
    )
    if (options.input !== undefined) child.stdin?.end(options.input)
    else child.stdin?.end()
  })
}

/** git's most useful line: why it failed, not the progress chatter or the generic last words. */
export function firstMeaningfulLine(output: string): string {
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean)
  const rejected = lines.find((l) => l.startsWith('! [rejected]') || l.startsWith('! [remote rejected]'))
  if (rejected) {
    if (/fetch first|non-fast-forward/.test(rejected)) return 'The remote has commits you don\'t have yet: pull them first (or force push to replace them).'
    if (/stale info/.test(rejected)) return 'The remote changed since your last fetch: fetch, check, then force push again.'
    return rejected.replace(/^!\s*/, '')
  }
  const line = lines.find((l) => /^fatal:/.test(l)) ?? lines.find((l) => /^CONFLICT/.test(l)) ?? lines.find((l) => /^error:/.test(l)) ?? lines[0] ?? ''
  return line.replace(/^(fatal|error):\s*/, '')
}

async function tryGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    return await git(cwd, args)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- live state

export async function readGitState(repoRoot: string): Promise<GitLiveState> {
  const [status, stashes, gitDir, remotes] = await Promise.all([
    git(repoRoot, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
    tryGit(repoRoot, ['stash', 'list', '--format=%gd%x1f%gs%x1f%ct', '-z']),
    git(repoRoot, ['rev-parse', '--git-dir']),
    tryGit(repoRoot, ['remote']),
  ])
  const state = parseStatusV2(status)
  state.stashes = parseStashes(stashes ?? '')
  const dir = isAbsolute(gitDir.trim()) ? gitDir.trim() : resolve(repoRoot, gitDir.trim())
  const operation = operationIn(dir)
  if (operation) state.operation = operation
  const names = (remotes ?? '').split('\n').map((r) => r.trim()).filter(Boolean)
  const remote = names.includes('origin') ? 'origin' : names[0]
  if (remote) state.remote = remote
  return state
}

function operationIn(gitDir: string): GitOperation | undefined {
  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) return 'rebase'
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge'
  if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
  if (existsSync(join(gitDir, 'REVERT_HEAD'))) return 'revert'
  return undefined
}

/** `git status --porcelain=v2 --branch -z` → branch, upstream, ahead/behind and the changed files. */
export function parseStatusV2(out: string): GitLiveState {
  const state: GitLiveState = { ahead: 0, behind: 0, files: [], stashes: [] }
  let sawAheadBehind = false
  const tokens = out.split('\0')
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i]
    if (!entry) continue
    if (entry.startsWith('# ')) {
      const [, key, ...rest] = entry.split(' ')
      const value = rest.join(' ')
      if (key === 'branch.oid' && value !== '(initial)') state.head = value
      else if (key === 'branch.head' && value !== '(detached)') state.branch = value
      else if (key === 'branch.upstream') state.upstream = value
      else if (key === 'branch.ab') {
        sawAheadBehind = true
        const match = /^\+(\d+) -(\d+)$/.exec(value)
        if (match) {
          state.ahead = Number(match[1])
          state.behind = Number(match[2])
        }
      }
      continue
    }
    const type = entry[0]
    if (type === '?') {
      state.files.push({ path: entry.slice(2), x: '?', y: '?' })
    } else if (type === '1') {
      state.files.push({ path: fieldsAfter(entry, 8), x: entry[2], y: entry[3] })
    } else if (type === '2') {
      // Renames and copies: the new path, then (next token) the old one.
      state.files.push({ path: fieldsAfter(entry, 9), from: tokens[++i], x: entry[2], y: entry[3] })
    } else if (type === 'u') {
      state.files.push({ path: fieldsAfter(entry, 10), x: entry[2], y: entry[3], conflicted: true })
    }
  }
  // An upstream without ahead/behind counts: it was deleted on the remote.
  if (state.upstream && !sawAheadBehind) state.upstreamGone = true
  return state
}

/** The rest of a space-separated record after `count` fields (paths may contain spaces). */
function fieldsAfter(entry: string, count: number): string {
  let index = 0
  for (let n = 0; n < count; n++) index = entry.indexOf(' ', index) + 1
  return entry.slice(index)
}

export function parseStashes(out: string): GitLiveState['stashes'] {
  return out
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [ref, message, date] = record.split('\x1f')
      return { index: Number(/\{(\d+)\}/.exec(ref)?.[1] ?? -1), message: message ?? '', date: Number(date) || 0 }
    })
    .filter((s) => s.index >= 0)
}

// ---------------------------------------------------------------- actions

const queues = new Map<string, Promise<unknown>>()

/** Runs one action (one at a time per repository) and returns what happened plus the new state. */
export async function runGitAction(repoRoot: string, action: GitAction): Promise<GitActionResult> {
  const key = resolve(repoRoot)
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(() => perform(repoRoot, action))
  queues.set(key, run)
  try {
    return await run
  } finally {
    if (queues.get(key) === run) queues.delete(key)
  }
}

async function perform(repoRoot: string, action: GitAction): Promise<GitActionResult> {
  let output = ''
  try {
    const state = await readGitState(repoRoot)
    const result = await dispatch(repoRoot, action, state)
    output = result.output
    return { ok: true, message: result.message, output, state: await readGitState(repoRoot) }
  } catch (error) {
    const state = await readGitState(repoRoot).catch(() => undefined)
    if (error instanceof GitCommandError) return { ok: false, error: error.message, output: error.output, ...(state ? { state } : {}) }
    throw error
  }
}

interface Done {
  message: string
  output: string
}

async function dispatch(root: string, action: GitAction, state: GitLiveState): Promise<Done> {
  const timeout = NETWORK_ACTIONS.has(action.type) ? NETWORK_TIMEOUT : LOCAL_TIMEOUT
  const run = (args: string[], input?: string) => git(root, args, { timeout, input })
  const done = (message: string, ...outputs: string[]): Done => ({ message, output: outputs.join('\n').trim() })

  switch (action.type) {
    case 'fetch': {
      if (!state.remote) throw new GitRequestError('This repository has no remote to fetch from.')
      return done('Fetched from all remotes', await run(['fetch', '--all', '--prune']))
    }

    case 'pull': {
      if (!state.branch) throw new GitRequestError('Check out a branch to pull.')
      if (!state.upstream) throw new GitRequestError(`${state.branch} has no upstream branch: publish it first.`)
      // Merge unless the user chose otherwise (without a choice, git refuses divergent branches).
      const configured = await tryGit(root, ['config', '--get', 'pull.rebase'])
      const args = configured === undefined ? ['-c', 'pull.rebase=false', 'pull', '--no-edit'] : ['pull', '--no-edit']
      return done(`Pulled ${state.upstream} into ${state.branch}`, await run(args))
    }

    case 'push': {
      if (!state.branch) throw new GitRequestError('Check out a branch to push.')
      const force = action.force ? ['--force-with-lease'] : []
      if (!state.upstream || state.upstreamGone) {
        if (!state.remote) throw new GitRequestError('This repository has no remote to push to.')
        const out = await run(['push', ...force, '--set-upstream', state.remote, `refs/heads/${state.branch}:refs/heads/${state.branch}`])
        return done(`Published ${state.branch} to ${state.remote}`, out)
      }
      const remote = (await tryGit(root, ['config', '--get', `branch.${state.branch}.remote`]))?.trim() || state.remote || 'origin'
      const merge = (await tryGit(root, ['config', '--get', `branch.${state.branch}.merge`]))?.trim() || `refs/heads/${state.branch}`
      const out = await run(['push', ...force, remote, `HEAD:${merge}`])
      return done(`${action.force ? 'Force pushed' : 'Pushed'} ${state.branch} to ${state.upstream}`, out)
    }

    case 'commit': {
      const summary = action.summary?.trim()
      if (!summary) throw new GitRequestError('Write a summary for the commit.')
      if (state.operation === 'merge' || state.operation === 'rebase') throw new GitRequestError(`A ${state.operation} is in progress: finish or abort it first.`)
      const files = pickFiles(state, action.files ?? [])
      if (files.length === 0 && !action.amend) throw new GitRequestError('Select at least one file to commit.')
      if (action.amend && !state.head) throw new GitRequestError('There is no commit to amend.')
      const message = commitMessage(summary, action.description)
      const amend = action.amend ? ['--amend'] : []
      if (files.length === 0) {
        // Amend only the message.
        const out = await run(['commit', ...amend, '--only', '--allow-empty', '-F', '-'], message)
        return done('Amended the last commit', out)
      }
      const toAdd = files.map((f) => f.path)
      const all = [...new Set(files.flatMap((f) => (f.from ? [f.from, f.path] : [f.path])))]
      await run(['add', '--all', '--', ...toAdd])
      const out = await run(['commit', ...amend, '-F', '-', '--', ...all], message)
      return done(`${action.amend ? 'Amended' : 'Committed'} ${files.length} file${files.length === 1 ? '' : 's'}${state.branch ? ` to ${state.branch}` : ''}`, out)
    }

    case 'undo-commit': {
      if (!state.head) throw new GitRequestError('There is no commit to undo.')
      if (state.operation) throw new GitRequestError(`A ${state.operation} is in progress.`)
      const parent = await tryGit(root, ['rev-parse', '-q', '--verify', 'HEAD~1^{commit}'])
      if (!parent) throw new GitRequestError('The first commit cannot be undone.')
      const subject = (await run(['log', '-1', '--format=%s'])).trim()
      return done(`Undid “${subject}”: its changes are back in the working tree`, await run(['reset', '--soft', 'HEAD~1']))
    }

    case 'discard': {
      const files = pickFiles(state, action.files ?? [])
      if (files.length === 0) throw new GitRequestError('Select the files to discard.')
      const untracked = files.filter((f) => f.x === '?').map((f) => f.path)
      // Files new in the index (not in HEAD) are removed from it and deleted, like untracked ones.
      const tracked = [...new Set(files.filter((f) => f.x !== '?').flatMap((f) => (f.from ? [f.from, f.path] : [f.path])))]
      const outputs: string[] = []
      if (tracked.length > 0) {
        if (!state.head) outputs.push(await run(['rm', '--cached', '--force', '--quiet', '--', ...tracked]))
        else outputs.push(await run(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked]))
      }
      if (untracked.length > 0 || !state.head) outputs.push(await run(['clean', '--force', '--quiet', '--', ...(state.head ? untracked : files.map((f) => f.path))]))
      return done(`Discarded the changes to ${files.length} file${files.length === 1 ? '' : 's'}`, ...outputs)
    }

    case 'stash': {
      if (state.files.length === 0) throw new GitRequestError('There are no changes to stash.')
      const message = action.message?.trim()
      return done('Stashed the changes', await run(['stash', 'push', '--include-untracked', ...(message ? ['--message', message] : [])]))
    }

    case 'stash-pop':
    case 'stash-apply':
    case 'stash-drop': {
      const stash = state.stashes.find((s) => s.index === action.index)
      if (!Number.isInteger(action.index) || !stash) throw new GitRequestError('That stash does not exist.')
      const verb = action.type === 'stash-pop' ? 'pop' : action.type === 'stash-apply' ? 'apply' : 'drop'
      const out = await run(['stash', verb, `stash@{${action.index}}`])
      return done(verb === 'drop' ? `Dropped “${stash.message}”` : `Restored “${stash.message}”`, out)
    }

    case 'checkout': {
      if (action.target === 'commit') {
        const commit = await resolveCommit(root, action.ref)
        return done(`Checked out ${action.ref} (detached HEAD)`, await run(['switch', '--detach', commit]))
      }
      await checkRefName(root, action.ref)
      if (action.target === 'remote') {
        const local = localNameOf(action.ref, await remoteNames(root))
        if (await refExists(root, `refs/heads/${local}`)) return done(`Switched to ${local}`, await run(['switch', local]))
        return done(`Switched to ${local}, tracking ${action.ref}`, await run(['switch', '--create', local, '--track', `refs/remotes/${action.ref}`]))
      }
      if (!(await refExists(root, `refs/heads/${action.ref}`))) throw new GitRequestError(`There is no branch ${action.ref}.`)
      return done(`Switched to ${action.ref}`, await run(['switch', action.ref]))
    }

    case 'create-branch': {
      await checkRefName(root, action.name)
      if (await refExists(root, `refs/heads/${action.name}`)) throw new GitRequestError(`A branch named ${action.name} already exists.`)
      const from = action.from ? await resolveCommit(root, action.from) : undefined
      if (!from && !state.head) throw new GitRequestError('Make a first commit before creating branches.')
      if (action.checkout) return done(`Created and switched to ${action.name}`, await run(['switch', '--create', action.name, ...(from ? [from] : [])]))
      return done(`Created ${action.name}`, await run(['branch', action.name, ...(from ? [from] : [])]))
    }

    case 'rename-branch': {
      await checkRefName(root, action.from)
      await checkRefName(root, action.to)
      if (!(await refExists(root, `refs/heads/${action.from}`))) throw new GitRequestError(`There is no branch ${action.from}.`)
      if (await refExists(root, `refs/heads/${action.to}`)) throw new GitRequestError(`A branch named ${action.to} already exists.`)
      return done(`Renamed ${action.from} to ${action.to}`, await run(['branch', '--move', action.from, action.to]))
    }

    case 'delete-branch': {
      await checkRefName(root, action.name)
      if (action.name === state.branch) throw new GitRequestError('You cannot delete the checked-out branch: switch to another one first.')
      if (!(await refExists(root, `refs/heads/${action.name}`))) throw new GitRequestError(`There is no branch ${action.name}.`)
      return done(`Deleted ${action.name}`, await run(['branch', action.force ? '-D' : '-d', action.name]))
    }

    case 'delete-remote-branch': {
      await checkRefName(root, action.name)
      const remotes = await remoteNames(root)
      const remote = remotes.find((r) => action.name.startsWith(`${r}/`))
      if (!remote || !(await refExists(root, `refs/remotes/${action.name}`))) throw new GitRequestError(`There is no remote branch ${action.name}.`)
      const branch = action.name.slice(remote.length + 1)
      return done(`Deleted ${branch} on ${remote}`, await run(['push', remote, '--delete', `refs/heads/${branch}`]))
    }

    case 'merge': {
      if (!state.head) throw new GitRequestError('Make a first commit before merging.')
      if (state.operation) throw new GitRequestError(`A ${state.operation} is in progress.`)
      const commit = await resolveRefOrCommit(root, action.ref)
      const into = state.branch ?? 'HEAD'
      if (action.squash) {
        const out = await run(['merge', '--squash', commit])
        // A squash leaves the result staged; commit it with git's prepared message.
        const staged = await tryGit(root, ['diff', '--cached', '--quiet'])
        if (staged !== undefined) return done(`${action.ref} is already in ${into}: nothing to squash`, out)
        return done(`Squashed ${action.ref} into ${into}`, out, await run(['commit', '--no-edit']))
      }
      return done(`Merged ${action.ref} into ${into}`, await run(['merge', '--no-edit', commit]))
    }

    case 'rebase': {
      if (!state.branch) throw new GitRequestError('Check out a branch to rebase.')
      if (state.operation) throw new GitRequestError(`A ${state.operation} is in progress.`)
      const commit = await resolveRefOrCommit(root, action.onto)
      return done(`Rebased ${state.branch} onto ${action.onto}`, await run(['rebase', commit]))
    }

    case 'abort': {
      if (!state.operation) throw new GitRequestError('Nothing to abort.')
      return done(`Aborted the ${state.operation}`, await run([state.operation, '--abort']))
    }

    case 'continue': {
      if (!state.operation) throw new GitRequestError('Nothing to continue.')
      const unresolved = state.files.filter((f) => f.conflicted && hasConflictMarkers(root, f.path)).map((f) => f.path)
      if (unresolved.length > 0) throw new GitRequestError(`Resolve the conflicts first (still marked in ${unresolved.join(', ')}).`)
      await run(['add', '--all'])
      if (state.operation === 'merge') return done('Committed the merge', await run(['commit', '--no-edit']))
      return done(`Continued the ${state.operation}`, await run([state.operation, '--continue']))
    }

    case 'cherry-pick':
    case 'revert': {
      if (!state.head) throw new GitRequestError('Make a first commit first.')
      if (state.operation) throw new GitRequestError(`A ${state.operation} is in progress.`)
      const commit = await resolveCommit(root, action.commit)
      // Merge commits are picked/reverted against their first parent.
      const parents = (await run(['rev-list', '--parents', '-n', '1', commit])).trim().split(' ').length - 1
      const mainline = parents > 1 ? ['-m', '1'] : []
      const out = await run(action.type === 'revert' ? ['revert', '--no-edit', ...mainline, commit] : ['cherry-pick', ...mainline, commit])
      return done(`${action.type === 'revert' ? 'Reverted' : 'Cherry-picked'} ${commit.slice(0, 7)}`, out)
    }

    case 'reset': {
      if (!['soft', 'mixed', 'hard'].includes(action.mode)) throw new GitRequestError('Unknown reset mode.')
      if (state.operation) throw new GitRequestError(`A ${state.operation} is in progress.`)
      const commit = await resolveCommit(root, action.commit)
      return done(`Reset ${state.branch ?? 'HEAD'} to ${commit.slice(0, 7)} (${action.mode})`, await run(['reset', `--${action.mode}`, commit]))
    }

    case 'create-tag': {
      await checkRefName(root, action.name, false)
      if (await refExists(root, `refs/tags/${action.name}`)) throw new GitRequestError(`A tag named ${action.name} already exists.`)
      const commit = await resolveCommit(root, action.commit)
      const message = action.message?.trim()
      const out = message ? await run(['tag', '--annotate', '--file=-', action.name, commit], `${message}\n`) : await run(['tag', action.name, commit])
      return done(`Tagged ${commit.slice(0, 7)} as ${action.name}`, out)
    }

    case 'delete-tag': {
      await checkRefName(root, action.name, false)
      if (!(await refExists(root, `refs/tags/${action.name}`))) throw new GitRequestError(`There is no tag ${action.name}.`)
      return done(`Deleted tag ${action.name}`, await run(['tag', '--delete', action.name]))
    }

    case 'push-tag': {
      await checkRefName(root, action.name, false)
      if (!state.remote) throw new GitRequestError('This repository has no remote to push to.')
      if (!(await refExists(root, `refs/tags/${action.name}`))) throw new GitRequestError(`There is no tag ${action.name}.`)
      return done(`Pushed tag ${action.name} to ${state.remote}`, await run(['push', state.remote, `refs/tags/${action.name}`]))
    }

    default:
      throw new GitRequestError(`Unknown action ${(action as { type?: unknown }).type as string}.`)
  }
}

/** The requested files, which must all be changed files git reports (nothing else can be committed or discarded). */
function pickFiles(state: GitLiveState, paths: unknown): LiveFile[] {
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) throw new GitRequestError('files must be a list of paths.')
  const byPath = new Map(state.files.map((f) => [f.path, f]))
  const unknown = (paths as string[]).filter((p) => !byPath.has(p))
  if (unknown.length > 0) throw new GitRequestError(`Not a changed file: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? '…' : ''}`)
  return [...new Set(paths as string[])].map((p) => byPath.get(p)!)
}

async function checkRefName(root: string, name: unknown, branch = true): Promise<void> {
  const problem = typeof name === 'string' ? refNameProblem(name) : 'A name is required.'
  if (problem) throw new GitRequestError(`Invalid name “${String(name)}”: ${problem}`)
  const ok = await tryGit(root, branch ? ['check-ref-format', '--branch', name as string] : ['check-ref-format', `refs/tags/${name as string}`])
  if (ok === undefined) throw new GitRequestError(`Invalid name “${name as string}”.`)
}

async function refExists(root: string, ref: string): Promise<boolean> {
  return (await tryGit(root, ['show-ref', '--verify', '--quiet', ref])) !== undefined
}

async function remoteNames(root: string): Promise<string[]> {
  return ((await tryGit(root, ['remote'])) ?? '').split('\n').map((r) => r.trim()).filter(Boolean)
}

/** "origin/feature/x" → "feature/x". */
function localNameOf(remoteBranch: string, remotes: string[]): string {
  const remote = [...remotes].sort((a, b) => b.length - a.length).find((r) => remoteBranch.startsWith(`${r}/`))
  return remote ? remoteBranch.slice(remote.length + 1) : remoteBranch
}

/** A commit hash → the full hash of an existing commit. */
async function resolveCommit(root: string, value: unknown): Promise<string> {
  if (typeof value !== 'string' || !isCommitHash(value)) throw new GitRequestError(`Not a commit hash: ${String(value)}`)
  const full = await tryGit(root, ['rev-parse', '-q', '--verify', `${value}^{commit}`])
  if (!full) throw new GitRequestError(`There is no commit ${value}.`)
  return full.trim()
}

/** A local branch, remote branch, tag or commit hash → a full commit hash. */
async function resolveRefOrCommit(root: string, value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value || value.startsWith('-')) throw new GitRequestError(`Not a branch or commit: ${String(value)}`)
  for (const ref of [`refs/heads/${value}`, `refs/remotes/${value}`, `refs/tags/${value}`]) {
    if (refNameProblem(value) === null && (await refExists(root, ref))) return (await git(root, ['rev-parse', `${ref}^{commit}`])).trim()
  }
  return resolveCommit(root, value)
}

function hasConflictMarkers(root: string, path: string): boolean {
  try {
    return /^(<{7}|>{7}) /m.test(readFileSync(join(root, path), 'utf8'))
  } catch {
    return false
  }
}
