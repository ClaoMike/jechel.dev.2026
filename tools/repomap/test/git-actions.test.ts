/**
 * The History tab's git commands, run against real temporary repositories: a bare "origin", a
 * working clone, and a second clone that plays a teammate pushing. Plus the status parser and the
 * checks that keep bad input away from git.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { GitRequestError, parseStashes, parseStatusV2, readGitState, runGitAction } from '../src/core/git-actions.ts'
import { commitMessage, isCommitHash, refNameProblem, type GitAction, type GitActionResult } from '../src/shared/git-actions.ts'

// The user's git config must not leak into the tests (signing, hooks, default branch…).
const sandbox = mkdtempSync(join(tmpdir(), 'repomap-actions-'))
writeFileSync(join(sandbox, 'gitconfig'), '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n')
process.env.GIT_CONFIG_GLOBAL = join(sandbox, 'gitconfig')
process.env.GIT_CONFIG_NOSYSTEM = '1'

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const write = (repo: string, path: string, text: string) => writeFileSync(join(repo, path), text)
const read = (repo: string, path: string) => readFileSync(join(repo, path), 'utf8')

/** A fresh origin + clone with one pushed commit (a.txt, b.txt) and a teammate's clone. */
function setup(): { origin: string; repo: string; other: string } {
  const dir = mkdtempSync(join(sandbox, 'case-'))
  const origin = join(dir, 'origin.git')
  const repo = join(dir, 'repo')
  const other = join(dir, 'other')
  sh(dir, 'init', '--quiet', '--bare', origin)
  sh(dir, 'clone', '--quiet', origin, repo)
  write(repo, 'a.txt', 'a\n')
  write(repo, 'b.txt', 'b\n')
  sh(repo, 'add', '.')
  sh(repo, 'commit', '--quiet', '-m', 'Initial commit')
  sh(repo, 'push', '--quiet', '-u', 'origin', 'main')
  sh(dir, 'clone', '--quiet', origin, other)
  return { origin, repo, other }
}

async function ok(repo: string, action: GitAction): Promise<Extract<GitActionResult, { ok: true }>> {
  const result = await runGitAction(repo, action)
  if (!result.ok) assert.fail(`${action.type} failed: ${result.error}\n${result.output ?? ''}`)
  return result
}

async function refused(repo: string, action: GitAction, pattern: RegExp): Promise<void> {
  await assert.rejects(runGitAction(repo, action), (error: Error) => error instanceof GitRequestError && pattern.test(error.message))
}

const subject = (repo: string, rev = 'HEAD') => sh(repo, 'log', '-1', '--format=%s', rev)
const filesIn = (repo: string, rev = 'HEAD') => sh(repo, 'show', '--name-status', '--format=', rev)

describe('git status --porcelain=v2 parsing', () => {
  it('reads the branch, upstream, counts and every kind of change', () => {
    const out = [
      '# branch.oid 1b89fe42794f76741ea6042ca1ce16897a6e3d52',
      '# branch.head feature/x',
      '# branch.upstream origin/feature/x',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 aaa aaa src/a file.ts',
      '1 A. N... 000000 100644 100644 000 bbb new.ts',
      '2 R. N... 100644 100644 100644 ccc ccc R100 docs/new name.md',
      'docs/old name.md',
      'u UU N... 100644 100644 100644 100644 d1 d2 d3 merge me.ts',
      '? untracked dir/file.txt',
      '',
    ].join('\0')
    const state = parseStatusV2(out)
    assert.equal(state.branch, 'feature/x')
    assert.equal(state.head, '1b89fe42794f76741ea6042ca1ce16897a6e3d52')
    assert.equal(state.upstream, 'origin/feature/x')
    assert.equal(state.ahead, 2)
    assert.equal(state.behind, 1)
    assert.equal(state.upstreamGone, undefined)
    assert.deepEqual(state.files, [
      { path: 'src/a file.ts', x: '.', y: 'M' },
      { path: 'new.ts', x: 'A', y: '.' },
      { path: 'docs/new name.md', from: 'docs/old name.md', x: 'R', y: '.' },
      { path: 'merge me.ts', x: 'U', y: 'U', conflicted: true },
      { path: 'untracked dir/file.txt', x: '?', y: '?' },
    ])
  })

  it('knows a detached HEAD, an empty repository and a deleted upstream', () => {
    assert.equal(parseStatusV2('# branch.oid abc\0# branch.head (detached)\0').branch, undefined)
    const empty = parseStatusV2('# branch.oid (initial)\0# branch.head main\0')
    assert.equal(empty.head, undefined)
    assert.equal(empty.branch, 'main')
    assert.equal(parseStatusV2('# branch.oid abc\0# branch.head x\0# branch.upstream origin/x\0').upstreamGone, true)
  })

  it('reads the stash list', () => {
    assert.deepEqual(parseStashes('stash@{0}\x1fOn main: wip\x1f1700000000\0stash@{1}\x1fWIP on x: abc\x1f1600000000\0'), [
      { index: 0, message: 'On main: wip', date: 1700000000 },
      { index: 1, message: 'WIP on x: abc', date: 1600000000 },
    ])
  })
})

describe('shared checks', () => {
  it('accepts the branch names git accepts', () => {
    for (const name of ['main', 'feature/login', 'fix-12', 'release/1.2.0', 'user/ada/x_y']) assert.equal(refNameProblem(name), null, name)
    for (const name of ['', ' x', '-x', '--upload-pack=evil', 'a..b', 'a b', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[', 'a\\b', 'x/', '/x', 'a//b', 'x.lock', 'x.', '.x', 'a/.b', 'HEAD', '@', 'a@{1}']) {
      assert.notEqual(refNameProblem(name), null, JSON.stringify(name))
    }
  })

  it('recognises commit hashes and builds commit messages', () => {
    assert.ok(isCommitHash('1b89fe4'))
    assert.ok(!isCommitHash('main'))
    assert.ok(!isCommitHash('-1b89fe4'))
    assert.equal(commitMessage(' Fix it ', ''), 'Fix it\n')
    assert.equal(commitMessage('Fix it', 'Because.\n\nCo-authored-by: A <a@x>'), 'Fix it\n\nBecause.\n\nCo-authored-by: A <a@x>\n')
  })
})

describe('git commands', () => {
  let origin: string
  let repo: string
  let other: string
  beforeEach(() => {
    ;({ origin, repo, other } = setup())
  })

  it('reads the live state', async () => {
    write(repo, 'a.txt', 'changed\n')
    write(repo, 'new.txt', 'new\n')
    const state = await readGitState(repo)
    assert.equal(state.branch, 'main')
    assert.equal(state.upstream, 'origin/main')
    assert.equal(state.remote, 'origin')
    assert.deepEqual(state.files.map((f) => `${f.x}${f.y} ${f.path}`), ['.M a.txt', '?? new.txt'])
    assert.equal(state.operation, undefined)
  })

  it('commits only the selected files, whatever was staged', async () => {
    write(repo, 'a.txt', 'a2\n')
    write(repo, 'b.txt', 'b2\n')
    write(repo, 'c.txt', 'c\n')
    sh(repo, 'add', 'b.txt') // staged, but not selected
    const result = await ok(repo, { type: 'commit', summary: 'Change a, add c', description: 'Details here.', files: ['a.txt', 'c.txt'] })
    assert.equal(result.message, 'Committed 2 files to main')
    assert.equal(filesIn(repo), 'M\ta.txt\nA\tc.txt')
    assert.equal(sh(repo, 'log', '-1', '--format=%B'), 'Change a, add c\n\nDetails here.')
    assert.deepEqual(result.state.files.map((f) => `${f.x}${f.y} ${f.path}`), ['M. b.txt'], 'b.txt is still staged')
    assert.equal(result.state.ahead, 1)
  })

  it('commits deletions and renames', async () => {
    rmSync(join(repo, 'b.txt'))
    sh(repo, 'mv', 'a.txt', 'renamed.txt')
    const state = await readGitState(repo)
    assert.deepEqual(state.files.map((f) => `${f.x}${f.y} ${f.path}${f.from ? ` < ${f.from}` : ''}`), ['.D b.txt', 'R. renamed.txt < a.txt'])
    await ok(repo, { type: 'commit', summary: 'Tidy up', files: ['b.txt', 'renamed.txt'] })
    assert.equal(filesIn(repo), 'D\tb.txt\nR100\ta.txt\trenamed.txt')
    assert.deepEqual((await readGitState(repo)).files, [])
  })

  it('amends the last commit, message only or with files', async () => {
    await ok(repo, { type: 'commit', summary: 'Better message', files: [], amend: true })
    assert.equal(subject(repo), 'Better message')
    assert.equal(sh(repo, 'rev-list', '--count', 'HEAD'), '1')
    write(repo, 'a.txt', 'forgot this\n')
    await ok(repo, { type: 'commit', summary: 'Better message', files: ['a.txt'], amend: true })
    assert.equal(sh(repo, 'rev-list', '--count', 'HEAD'), '1')
    assert.equal(sh(repo, 'show', 'HEAD:a.txt'), 'forgot this')
  })

  it('refuses commits that make no sense, before running git', async () => {
    write(repo, 'a.txt', 'a2\n')
    await refused(repo, { type: 'commit', summary: '  ', files: ['a.txt'] }, /summary/)
    await refused(repo, { type: 'commit', summary: 'x', files: [] }, /Select at least one file/)
    await refused(repo, { type: 'commit', summary: 'x', files: ['b.txt'] }, /Not a changed file: b.txt/)
    await refused(repo, { type: 'commit', summary: 'x', files: ['../../etc/passwd'] }, /Not a changed file/)
    await refused(repo, { type: 'commit', summary: 'x', files: ['--all'] }, /Not a changed file/)
    await refused(repo, { type: 'commit', summary: 'x', files: 'a.txt' as unknown as string[] }, /list of paths/)
    assert.equal(sh(repo, 'rev-list', '--count', 'HEAD'), '1')
  })

  it('undoes the last commit, keeping its changes', async () => {
    write(repo, 'a.txt', 'a2\n')
    await ok(repo, { type: 'commit', summary: 'Oops', files: ['a.txt'] })
    const result = await ok(repo, { type: 'undo-commit' })
    assert.match(result.message, /Undid “Oops”/)
    assert.equal(subject(repo), 'Initial commit')
    assert.equal(read(repo, 'a.txt'), 'a2\n')
    await refused(repo, { type: 'undo-commit' }, /first commit cannot be undone/)
  })

  it('discards changes: modified, new in the index, untracked and deleted files', async () => {
    write(repo, 'a.txt', 'a2\n')
    write(repo, 'staged-new.txt', 'x\n')
    sh(repo, 'add', 'staged-new.txt')
    write(repo, 'untracked.txt', 'y\n')
    rmSync(join(repo, 'b.txt'))
    write(repo, 'keep.txt', 'keep\n')
    await ok(repo, { type: 'discard', files: ['a.txt', 'staged-new.txt', 'untracked.txt', 'b.txt'] })
    assert.equal(read(repo, 'a.txt'), 'a\n')
    assert.equal(read(repo, 'b.txt'), 'b\n')
    assert.ok(!existsSync(join(repo, 'staged-new.txt')))
    assert.ok(!existsSync(join(repo, 'untracked.txt')))
    assert.deepEqual((await readGitState(repo)).files.map((f) => f.path), ['keep.txt'], 'files not listed are left alone')
    await refused(repo, { type: 'discard', files: ['a.txt'] }, /Not a changed file/)
  })

  it('pushes, publishes new branches and force pushes with a lease', async () => {
    write(repo, 'a.txt', 'a2\n')
    await ok(repo, { type: 'commit', summary: 'Local work', files: ['a.txt'] })
    assert.equal((await readGitState(repo)).ahead, 1)
    const pushed = await ok(repo, { type: 'push' })
    assert.equal(pushed.message, 'Pushed main to origin/main')
    assert.equal(pushed.state.ahead, 0)
    assert.equal(sh(origin, 'log', '-1', '--format=%s', 'main'), 'Local work')

    await ok(repo, { type: 'create-branch', name: 'feature/x', checkout: true })
    const published = await ok(repo, { type: 'push' })
    assert.equal(published.message, 'Published feature/x to origin')
    assert.equal(published.state.upstream, 'origin/feature/x')

    // Rewrite the pushed commit: a plain push is rejected, a force push goes through.
    await ok(repo, { type: 'commit', summary: 'Rewritten', files: [], amend: true })
    const rejected = await runGitAction(repo, { type: 'push' })
    assert.equal(rejected.ok, false)
    assert.match(rejected.ok ? '' : `${rejected.error} ${rejected.output}`, /rejected|non-fast-forward|fetch first/)
    await ok(repo, { type: 'push', force: true })
    assert.equal(sh(origin, 'log', '-1', '--format=%s', 'feature/x'), 'Rewritten')
  })

  it('fetches and pulls what a teammate pushed, merging diverged work', async () => {
    write(other, 'b.txt', 'from teammate\n')
    sh(other, 'commit', '--quiet', '-am', 'Teammate change')
    sh(other, 'push', '--quiet')
    const fetched = await ok(repo, { type: 'fetch' })
    assert.equal(fetched.state.behind, 1)
    write(repo, 'a.txt', 'mine\n')
    await ok(repo, { type: 'commit', summary: 'My change', files: ['a.txt'] })
    const pulled = await ok(repo, { type: 'pull' })
    assert.equal(pulled.state.behind, 0)
    assert.equal(pulled.state.ahead, 2, 'my commit + the merge')
    assert.equal(read(repo, 'b.txt'), 'from teammate\n')
    assert.equal(read(repo, 'a.txt'), 'mine\n')
  })

  it('creates, switches, renames and deletes branches', async () => {
    const head = sh(repo, 'rev-parse', 'HEAD')
    await ok(repo, { type: 'create-branch', name: 'topic', from: head.slice(0, 7), checkout: false })
    assert.equal((await readGitState(repo)).branch, 'main', 'not checked out')
    await ok(repo, { type: 'checkout', ref: 'topic', target: 'branch' })
    assert.equal((await readGitState(repo)).branch, 'topic')
    await refused(repo, { type: 'create-branch', name: 'topic', checkout: false }, /already exists/)
    await refused(repo, { type: 'create-branch', name: 'bad name', checkout: false }, /Invalid name/)
    await refused(repo, { type: 'create-branch', name: '--orphan', checkout: false }, /Invalid name/)
    await refused(repo, { type: 'create-branch', name: 'x', from: 'HEAD~1', checkout: false }, /Not a commit hash/)
    await refused(repo, { type: 'delete-branch', name: 'topic' }, /checked-out branch/)

    await ok(repo, { type: 'rename-branch', from: 'topic', to: 'topic-2' })
    assert.equal((await readGitState(repo)).branch, 'topic-2')
    write(repo, 'a.txt', 'unmerged\n')
    await ok(repo, { type: 'commit', summary: 'Unmerged work', files: ['a.txt'] })
    await ok(repo, { type: 'checkout', ref: 'main', target: 'branch' })
    const unmerged = await runGitAction(repo, { type: 'delete-branch', name: 'topic-2' })
    assert.equal(unmerged.ok, false, 'git -d refuses unmerged branches')
    assert.match(unmerged.ok ? '' : unmerged.error, /not fully merged/)
    await ok(repo, { type: 'delete-branch', name: 'topic-2', force: true })
    assert.equal(sh(repo, 'branch', '--list', 'topic-2'), '')
    await refused(repo, { type: 'checkout', ref: 'nope', target: 'branch' }, /no branch nope/)
  })

  it('checks out remote branches as tracking branches, and commits detached', async () => {
    sh(other, 'switch', '--quiet', '-c', 'feature/remote')
    write(other, 'r.txt', 'r\n')
    sh(other, 'add', '.')
    sh(other, 'commit', '--quiet', '-m', 'Remote work')
    sh(other, 'push', '--quiet', '-u', 'origin', 'feature/remote')
    await ok(repo, { type: 'fetch' })
    const result = await ok(repo, { type: 'checkout', ref: 'origin/feature/remote', target: 'remote' })
    assert.equal(result.message, 'Switched to feature/remote, tracking origin/feature/remote')
    assert.equal(result.state.branch, 'feature/remote')
    assert.equal(result.state.upstream, 'origin/feature/remote')
    const first = sh(repo, 'rev-list', '--max-parents=0', 'HEAD')
    const detached = await ok(repo, { type: 'checkout', ref: first, target: 'commit' })
    assert.equal(detached.state.branch, undefined)
    assert.equal(detached.state.head, first)
    await ok(repo, { type: 'delete-remote-branch', name: 'origin/feature/remote' })
    assert.equal(sh(origin, 'branch', '--list', 'feature/remote'), '')
  })

  it('merges, and walks through a conflict to a merge commit', async () => {
    await ok(repo, { type: 'create-branch', name: 'side', checkout: true })
    write(repo, 'a.txt', 'side\n')
    await ok(repo, { type: 'commit', summary: 'Side change', files: ['a.txt'] })
    await ok(repo, { type: 'checkout', ref: 'main', target: 'branch' })
    write(repo, 'a.txt', 'main\n')
    await ok(repo, { type: 'commit', summary: 'Main change', files: ['a.txt'] })

    const conflict = await runGitAction(repo, { type: 'merge', ref: 'side' })
    assert.equal(conflict.ok, false)
    assert.match(conflict.ok ? '' : conflict.error, /CONFLICT|conflict/)
    assert.equal(conflict.state?.operation, 'merge')
    assert.deepEqual(conflict.state?.files.filter((f) => f.conflicted).map((f) => f.path), ['a.txt'])
    await refused(repo, { type: 'commit', summary: 'x', files: ['a.txt'] }, /merge is in progress/)
    await refused(repo, { type: 'continue' }, /still marked in a.txt/)

    write(repo, 'a.txt', 'both\n')
    const merged = await ok(repo, { type: 'continue' })
    assert.equal(merged.message, 'Committed the merge')
    assert.equal(merged.state.operation, undefined)
    assert.equal(sh(repo, 'rev-list', '--count', '--merges', 'HEAD'), '1')
    assert.equal(read(repo, 'a.txt'), 'both\n')
  })

  it('aborts a conflicted merge', async () => {
    await ok(repo, { type: 'create-branch', name: 'side', checkout: true })
    write(repo, 'a.txt', 'side\n')
    await ok(repo, { type: 'commit', summary: 'Side', files: ['a.txt'] })
    await ok(repo, { type: 'checkout', ref: 'main', target: 'branch' })
    write(repo, 'a.txt', 'main\n')
    await ok(repo, { type: 'commit', summary: 'Main', files: ['a.txt'] })
    await runGitAction(repo, { type: 'merge', ref: 'side' })
    const aborted = await ok(repo, { type: 'abort' })
    assert.equal(aborted.message, 'Aborted the merge')
    assert.equal(aborted.state.operation, undefined)
    assert.equal(read(repo, 'a.txt'), 'main\n')
    await refused(repo, { type: 'abort' }, /Nothing to abort/)
  })

  it('squash-merges a branch into one commit', async () => {
    await ok(repo, { type: 'create-branch', name: 'feature', checkout: true })
    for (const n of [1, 2]) {
      write(repo, `f${n}.txt`, `${n}\n`)
      await ok(repo, { type: 'commit', summary: `Feature part ${n}`, files: [`f${n}.txt`] })
    }
    await ok(repo, { type: 'checkout', ref: 'main', target: 'branch' })
    const result = await ok(repo, { type: 'merge', ref: 'feature', squash: true })
    assert.equal(result.message, 'Squashed feature into main')
    assert.equal(sh(repo, 'rev-list', '--count', 'HEAD'), '2', 'one new commit, no merge')
    assert.equal(filesIn(repo), 'A\tf1.txt\nA\tf2.txt')
    assert.deepEqual(result.state.files, [])
  })

  it('rebases the current branch', async () => {
    await ok(repo, { type: 'create-branch', name: 'topic', checkout: true })
    write(repo, 't.txt', 't\n')
    await ok(repo, { type: 'commit', summary: 'Topic work', files: ['t.txt'] })
    await ok(repo, { type: 'checkout', ref: 'main', target: 'branch' })
    write(repo, 'm.txt', 'm\n')
    await ok(repo, { type: 'commit', summary: 'Main work', files: ['m.txt'] })
    await ok(repo, { type: 'checkout', ref: 'topic', target: 'branch' })
    await ok(repo, { type: 'rebase', onto: 'main' })
    assert.equal(sh(repo, 'log', '--format=%s', '-3'), 'Topic work\nMain work\nInitial commit')
  })

  it('cherry-picks, reverts and resets', async () => {
    await ok(repo, { type: 'create-branch', name: 'side', checkout: true })
    write(repo, 's.txt', 's\n')
    await ok(repo, { type: 'commit', summary: 'Pick me', files: ['s.txt'] })
    const pick = sh(repo, 'rev-parse', 'HEAD')
    await ok(repo, { type: 'checkout', ref: 'main', target: 'branch' })
    await ok(repo, { type: 'cherry-pick', commit: pick })
    assert.equal(subject(repo), 'Pick me')
    await ok(repo, { type: 'revert', commit: sh(repo, 'rev-parse', 'HEAD') })
    assert.equal(subject(repo), 'Revert "Pick me"')
    assert.ok(!existsSync(join(repo, 's.txt')))

    const initial = sh(repo, 'rev-list', '--max-parents=0', 'HEAD')
    await ok(repo, { type: 'reset', commit: initial, mode: 'soft' })
    assert.equal(sh(repo, 'rev-parse', 'HEAD'), initial)
    await ok(repo, { type: 'reset', commit: initial, mode: 'hard' })
    assert.deepEqual((await readGitState(repo)).files, [])
    await refused(repo, { type: 'reset', commit: initial, mode: 'keep' as 'hard' }, /Unknown reset mode/)
  })

  it('creates, pushes and deletes tags', async () => {
    const head = sh(repo, 'rev-parse', 'HEAD')
    await ok(repo, { type: 'create-tag', name: 'v1.0.0', commit: head, message: 'First release' })
    assert.equal(sh(repo, 'tag', '-l', '--format=%(contents:subject)', 'v1.0.0'), 'First release')
    await ok(repo, { type: 'create-tag', name: 'light', commit: head })
    await refused(repo, { type: 'create-tag', name: 'v1.0.0', commit: head }, /already exists/)
    await ok(repo, { type: 'push-tag', name: 'v1.0.0' })
    assert.equal(sh(origin, 'tag', '-l'), 'v1.0.0')
    await ok(repo, { type: 'delete-tag', name: 'light' })
    assert.equal(sh(repo, 'tag', '-l'), 'v1.0.0')
  })

  it('stashes and restores changes, untracked files included', async () => {
    await refused(repo, { type: 'stash' }, /no changes to stash/)
    write(repo, 'a.txt', 'wip\n')
    write(repo, 'new.txt', 'new\n')
    const stashed = await ok(repo, { type: 'stash', message: 'half done' })
    assert.deepEqual(stashed.state.files, [])
    assert.equal(stashed.state.stashes.length, 1)
    assert.match(stashed.state.stashes[0].message, /half done/)
    const popped = await ok(repo, { type: 'stash-pop', index: 0 })
    assert.equal(popped.state.stashes.length, 0)
    assert.equal(read(repo, 'a.txt'), 'wip\n')
    assert.equal(read(repo, 'new.txt'), 'new\n')
    await ok(repo, { type: 'stash' })
    await ok(repo, { type: 'stash-drop', index: 0 })
    assert.equal((await readGitState(repo)).stashes.length, 0)
    await refused(repo, { type: 'stash-apply', index: 3 }, /does not exist/)
  })

  it('runs one command at a time', async () => {
    write(repo, 'a.txt', 'a2\n')
    write(repo, 'b.txt', 'b2\n')
    const results = await Promise.all([
      runGitAction(repo, { type: 'commit', summary: 'First', files: ['a.txt'] }),
      runGitAction(repo, { type: 'commit', summary: 'Second', files: ['b.txt'] }),
    ])
    assert.ok(results.every((r) => r.ok))
    assert.equal(sh(repo, 'log', '--format=%s', '-2'), 'Second\nFirst')
  })

  it('reports an error from git, with its output, and never throws for it', async () => {
    sh(repo, 'remote', 'set-url', 'origin', join(sandbox, 'does-not-exist.git'))
    const result = await runGitAction(repo, { type: 'fetch' })
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.error.length > 0 && result.state?.branch === 'main')
  })
})

describe("git's error messages", () => {
  it('picks the reason, not the generic last words', async () => {
    const { firstMeaningfulLine } = await import('../src/core/git-actions.ts')
    const push = "To github.com:acme/x.git\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to 'github.com:acme/x.git'\nhint: Updates were rejected"
    assert.match(firstMeaningfulLine(push), /pull them first/)
    const merge = 'Auto-merging a.txt\nCONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts and then commit the result.'
    assert.equal(firstMeaningfulLine(merge), 'CONFLICT (content): Merge conflict in a.txt')
    assert.equal(firstMeaningfulLine("fatal: 'nowhere' does not appear to be a git repository\nfatal: Could not read from remote repository."), "'nowhere' does not appear to be a git repository")
    assert.equal(firstMeaningfulLine('error: pathspec x did not match'), 'pathspec x did not match')
  })
})
