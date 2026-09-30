/**
 * git.json: parsing git's output, recognising pull requests, GitHub enrichment (stubbed, no
 * network) and reading a real temporary repository.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, describe, it } from 'node:test'
import { loadConfig } from '../src/core/config.ts'
import {
  detectPullRequests,
  historyBeside,
  mergePullRequests,
  parseLog,
  parseRefs,
  parseRemotes,
  parseStatus,
  readGitHistory,
  stripCredentials,
  updateGitHistory,
  webFromRemote,
  type HistoryOptions,
} from '../src/core/git-history.ts'
import { createLogger } from '../src/core/log.ts'
import { checkGitHistory, commitUrl, pullRequestUrl, type GitCommit, type GitHistory } from '../src/shared/git-types.ts'

// The user's git config must not leak into the tests (signing, hooks, default branch…).
const sandbox = mkdtempSync(join(tmpdir(), 'repomap-git-'))
writeFileSync(join(sandbox, 'gitconfig'), '')
process.env.GIT_CONFIG_GLOBAL = join(sandbox, 'gitconfig')
process.env.GIT_CONFIG_NOSYSTEM = '1'

const OPTIONS: HistoryOptions = {
  name: 'demo',
  maxCommits: 100,
  maxFilesPerCommit: 50,
  github: 'off',
  githubCacheMinutes: 10,
  maxPullRequests: 100,
}

const commit = (partial: Partial<GitCommit> & { hash: string; subject: string }): GitCommit => ({ parents: [], author: 'A', date: 1, ...partial })

describe('parsing git output', () => {
  it('reads commits with renames, binary files, merges and co-authors', () => {
    const R = '\x1e'
    const F = '\x1f'
    const out =
      `${R}c2${F}c1 x9${F}Ada Park${F}200${F}GitHub${F}260${F}Merge pull request #4 from acme/feat${F}Title line\n${F}${F}\0\n` +
      `:100644 100644 aaa bbb R090\0old/name.ts\0new/name.ts\0:000000 100644 000 ccc A\0logo.png\0` +
      `3\t1\t\0old/name.ts\0new/name.ts\0-\t-\tlogo.png\0` +
      `${R}c1${F}${F}Ada Park${F}100${F}Ada Park${F}100${F}First${F}${F}Claude <noreply@anthropic.com>\x1dLena Novak <lena@example.com>${F}\0`
    const [merge, first] = parseLog(out)
    assert.deepEqual(merge.parents, ['c1', 'x9'])
    assert.equal(merge.committer, 'GitHub')
    assert.equal(merge.committedAt, 260)
    assert.equal(merge.body, 'Title line')
    assert.deepEqual(merge.files, [
      { path: 'new/name.ts', status: 'R', from: 'old/name.ts', additions: 3, deletions: 1 },
      { path: 'logo.png', status: 'A' },
    ])
    assert.deepEqual(merge.stats, { files: 2, additions: 3, deletions: 1 })
    assert.deepEqual(first.parents, [])
    assert.equal(first.committer, undefined)
    assert.equal(first.committedAt, undefined)
    assert.deepEqual(first.coAuthors, ['Claude', 'Lena Novak'])
    assert.equal(first.files, undefined)
  })

  it('caps the files listed per commit but counts them all', () => {
    const R = '\x1e'
    const F = '\x1f'
    const raw = Array.from({ length: 5 }, (_, i) => `:000000 100644 0 1 A\0f${i}.txt\0`).join('')
    const nums = Array.from({ length: 5 }, (_, i) => `1\t0\tf${i}.txt\0`).join('')
    const [big] = parseLog(`${R}c${F}${F}A${F}1${F}A${F}1${F}Big${F}${F}${F}\0\n${raw}${nums}`, 2)
    assert.equal(big.files?.length, 2)
    assert.equal(big.filesOmitted, 3)
    assert.deepEqual(big.stats, { files: 5, additions: 5, deletions: 0 })
  })

  it('reads branches, remotes and tags', () => {
    const line = (...fields: string[]) => fields.join('\0')
    const refs = parseRefs(
      [
        line('refs/heads/main', 'm1', 'commit', '', '', 'refs/remotes/origin/main', 'ahead 2, behind 1', 'subject'),
        line('refs/heads/old', 'o1', 'commit', '', '', 'refs/remotes/origin/old', 'gone', ''),
        line('refs/remotes/origin/HEAD', 'm1', 'commit', '', '', '', '', ''),
        line('refs/remotes/origin/main', 'm0', 'commit', '', '', '', '', ''),
        line('refs/remotes/stale/x', 's1', 'commit', '', '', '', '', ''),
        line('refs/tags/v1', 't1', 'tag', 'm0', 'commit', '', '', 'Release one'),
        line('refs/tags/light', 'm1', 'commit', '', '', '', '', 'subject'),
        line('refs/tags/tree', 'tr', 'tag', 'tt', 'tree', '', '', ''),
      ].join('\n'),
      ['origin'],
    )
    assert.deepEqual(refs, [
      { name: 'main', type: 'branch', commit: 'm1', upstream: 'origin/main', ahead: 2, behind: 1 },
      { name: 'old', type: 'branch', commit: 'o1', upstream: 'origin/old', gone: true },
      { name: 'origin/main', type: 'remote', commit: 'm0' },
      { name: 'v1', type: 'tag', commit: 'm0', message: 'Release one' },
      { name: 'light', type: 'tag', commit: 'm1' },
    ])
  })

  it('reads remotes without their credentials', () => {
    assert.deepEqual(parseRemotes('remote.origin.url https://me:token@github.com/a/b.git\nremote.fork.url git@github.com:me/b.git\n'), [
      { name: 'origin', url: 'https://github.com/a/b.git' },
      { name: 'fork', url: 'git@github.com:me/b.git' },
    ])
    assert.equal(stripCredentials('ssh://git@host.com/x.git'), 'ssh://host.com/x.git')
    assert.equal(stripCredentials('/local/path'), '/local/path')
  })

  it('finds the web page of known hosts', () => {
    assert.deepEqual(webFromRemote('https://github.com/acme/app.git'), { host: 'github', url: 'https://github.com/acme/app' })
    assert.deepEqual(webFromRemote('git@github.com:acme/app.git'), { host: 'github', url: 'https://github.com/acme/app' })
    assert.deepEqual(webFromRemote('ssh://git@github.com/acme/app'), { host: 'github', url: 'https://github.com/acme/app' })
    assert.deepEqual(webFromRemote('git@gitlab.com:group/sub/app.git'), { host: 'gitlab', url: 'https://gitlab.com/group/sub/app' })
    assert.deepEqual(webFromRemote('https://bitbucket.org/team/app.git'), { host: 'bitbucket', url: 'https://bitbucket.org/team/app' })
    assert.deepEqual(webFromRemote('git@ssh.dev.azure.com:v3/org/proj/app'), { host: 'azure', url: 'https://dev.azure.com/org/proj/_git/app' })
    assert.deepEqual(webFromRemote('https://dev.azure.com/org/proj/_git/app'), { host: 'azure', url: 'https://dev.azure.com/org/proj/_git/app' })
    assert.deepEqual(webFromRemote('https://git.example.com/team/app.git'), { host: 'other', url: 'https://git.example.com/team/app' })
    assert.equal(webFromRemote('/srv/git/app.git'), undefined)
    assert.equal(webFromRemote('file:///srv/git/app.git'), undefined)
  })

  it('builds links for each host', () => {
    assert.equal(commitUrl({ host: 'github', url: 'https://github.com/a/b' }, 'abc'), 'https://github.com/a/b/commit/abc')
    assert.equal(commitUrl({ host: 'gitlab', url: 'https://gitlab.com/a/b' }, 'abc'), 'https://gitlab.com/a/b/-/commit/abc')
    assert.equal(pullRequestUrl({ host: 'bitbucket', url: 'https://bitbucket.org/a/b' }, 3), 'https://bitbucket.org/a/b/pull-requests/3')
    assert.equal(pullRequestUrl({ host: 'other', url: 'https://x/a/b' }, 3), undefined)
    assert.equal(commitUrl(undefined, 'abc'), undefined)
  })

  it('counts the working tree', () => {
    const tree = parseStatus(['M  staged.ts', ' M changed.ts', 'MM both.ts', '?? new.ts', 'UU conflict.ts', 'R  renamed.ts', 'old-name.ts', ''].join('\0'))
    assert.deepEqual({ ...tree, files: tree?.files.map((f) => `${f.status}|${f.path}`) }, {
      staged: 3,
      unstaged: 2,
      untracked: 1,
      conflicted: 1,
      files: ['M |staged.ts', ' M|changed.ts', 'MM|both.ts', '??|new.ts', 'UU|conflict.ts', 'R |renamed.ts'],
    })
    assert.equal(parseStatus(''), undefined)
  })
})

describe('pull requests from commit messages', () => {
  it('recognises GitHub, Bitbucket, Azure DevOps and GitLab merges, and squashes', () => {
    const prs = detectPullRequests([
      commit({ hash: 'a', parents: ['1', '2'], subject: 'Merge pull request #12 from acme/feature/login', body: 'Sign-in form\n\nDetails' }),
      commit({ hash: 'b', parents: ['1', '2'], subject: 'Merged in feature/pay (pull request #7)', body: 'Payments' }),
      commit({ hash: 'c', parents: ['1'], subject: 'Merged PR 31: Faster search' }),
      commit({ hash: 'd', parents: ['1', '2'], subject: "Merge branch 'feature/x' into 'main'", body: 'Add X\n\nSee merge request group/app!9' }),
      commit({ hash: 'e', parents: ['1'], subject: 'Bump vite from 7.1.2 to 7.1.5 (#40)' }),
      commit({ hash: 'f', parents: ['1', '2'], subject: "Merge branch 'dev' into main" }),
      commit({ hash: 'g', parents: ['1'], subject: 'Revert "Bump vite (#40)"' }),
      commit({ hash: 'h', parents: ['1'], subject: 'Again (#12)' }),
    ])
    assert.deepEqual(
      prs.map((pr) => [pr.number, pr.title, pr.source ?? null, pr.target ?? null, pr.mergeCommit, pr.origin]),
      [
        [40, 'Bump vite from 7.1.2 to 7.1.5', null, null, 'e', 'squash-message'],
        [31, 'Faster search', null, null, 'c', 'merge-message'],
        [12, 'Sign-in form', 'feature/login', null, 'a', 'merge-message'],
        [9, 'Add X', 'feature/x', 'main', 'd', 'merge-message'],
        [7, 'Payments', 'feature/pay', null, 'b', 'merge-message'],
      ],
    )
    assert.ok(prs.every((pr) => pr.state === 'merged'))
  })

  it('lets hosting data win, keeping local merge commits it lacks', () => {
    const local = detectPullRequests([commit({ hash: 'm', parents: ['1', '2'], subject: 'Merge pull request #1 from acme/a', body: 'Old title' })])
    const merged = mergePullRequests(
      local,
      [
        { number: 1, title: 'New title', state: 'merged', mergeCommit: 'unknown', url: 'https://x/1', origin: 'github' },
        { number: 2, title: 'Open one', state: 'open', mergeCommit: 'test-merge', headCommit: 'h', origin: 'github' },
      ],
      new Set(['m', 'h']),
    )
    assert.deepEqual(
      merged.map((pr) => [pr.number, pr.title, pr.mergeCommit ?? null, pr.url ?? null]),
      [
        [2, 'Open one', null, null],
        [1, 'New title', 'm', 'https://x/1'],
      ],
    )
  })
})

describe('reading a repository', () => {
  const repo = join(sandbox, 'repo')
  let clock = 1_767_225_600 // 2026-01-01T00:00:00Z
  const env = { GIT_AUTHOR_NAME: 'Ada Park', GIT_AUTHOR_EMAIL: 'ada@example.com', GIT_COMMITTER_NAME: 'Ada Park', GIT_COMMITTER_EMAIL: 'ada@example.com' }
  const git = (args: string[], extra: Record<string, string> = {}) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, ...env, ...extra } }).trim()
  const write = (path: string, text: string | Buffer) => {
    mkdirSync(join(repo, path, '..'), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  const commitAll = (message: string, extra: Record<string, string> = {}) => {
    clock += 3600
    const date = `${clock} +0000`
    git(['add', '-A'])
    git(['commit', '-q', '-m', message], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, ...extra })
    return git(['rev-parse', 'HEAD'])
  }
  const hashes: Record<string, string> = {}
  let history: GitHistory

  before(async () => {
    mkdirSync(repo)
    git(['init', '-q', '-b', 'main'])
    write('README.md', '# Demo\n')
    hashes.initial = commitAll('Initial commit')
    write('src/app.ts', 'export const app = 1\n')
    write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1, 2, 3]))
    hashes.app = commitAll('Add the app')
    git(['checkout', '-q', '-b', 'feature/login'])
    write('src/login.ts', 'export const login = () => true\n')
    hashes.login = commitAll('Login form')
    write('src/login.test.ts', 'test\n')
    hashes.loginTests = commitAll('Login tests\n\nCo-authored-by: Claude <noreply@anthropic.com>')
    git(['checkout', '-q', 'main'])
    write('README.md', '# Demo\n\nNow with login.\n')
    hashes.readme = commitAll('Update the README')
    clock += 3600
    git(['merge', '-q', '--no-ff', 'feature/login', '-m', 'Merge pull request #1 from acme/feature/login', '-m', 'Sign-in form'], {
      GIT_AUTHOR_DATE: `${clock} +0000`,
      GIT_COMMITTER_DATE: `${clock + 60} +0000`,
      GIT_COMMITTER_NAME: 'GitHub',
    })
    hashes.merge = git(['rev-parse', 'HEAD'])
    git(['mv', 'src/app.ts', 'src/main.ts'])
    hashes.rename = commitAll('Rename the app (#2)')
    git(['tag', '-a', 'v1.0', '-m', 'First release'])
    rmSync(join(repo, 'logo.png'))
    hashes.deleteLogo = commitAll('Remove the logo')
    git(['checkout', '-q', '-b', 'topic'])
    write('topic.txt', 'wip\n')
    hashes.topic = commitAll('Topic work')
    git(['checkout', '-q', 'main'])
    git(['remote', 'add', 'origin', 'https://someone:secret-token@github.com/acme/demo.git'])
    git(['update-ref', 'refs/remotes/origin/main', hashes.rename])
    git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'])
    git(['config', 'branch.main.remote', 'origin'])
    git(['config', 'branch.main.merge', 'refs/heads/main'])
    // Uncommitted: one staged file, one modified, one untracked.
    write('staged.txt', 'staged\n')
    git(['add', 'staged.txt'])
    write('README.md', '# Demo\n\nChanged.\n')
    write('notes.txt', 'untracked\n')
    history = (await readGitHistory(repo, OPTIONS))!
  })

  it('writes a valid git.json', () => {
    assert.equal(checkGitHistory(history), null)
    assert.equal(history.kind, 'repomap-git')
    assert.equal(history.repo.name, 'demo')
  })

  it('lists every commit of every branch, children before parents', () => {
    assert.equal(history.commits.length, 9)
    const index = new Map(history.commits.map((c, i) => [c.hash, i]))
    for (const c of history.commits) for (const parent of c.parents) assert.ok(index.get(c.hash)! < index.get(parent)!, `${c.subject} before its parent`)
    assert.equal(history.commits[0].hash, hashes.topic)
  })

  it('records authors, committers, co-authors and changed files', () => {
    const byHash = new Map(history.commits.map((c) => [c.hash, c]))
    const merge = byHash.get(hashes.merge)!
    assert.deepEqual(merge.parents, [hashes.readme, hashes.loginTests])
    assert.equal(merge.author, 'Ada Park')
    assert.equal(merge.committer, 'GitHub')
    assert.equal(merge.committedAt, merge.date + 60)
    // A merge lists what it brought in (against its first parent).
    assert.deepEqual(merge.files?.map((f) => `${f.status} ${f.path}`).sort(), ['A src/login.test.ts', 'A src/login.ts'])
    assert.deepEqual(byHash.get(hashes.loginTests)!.coAuthors, ['Claude'])
    assert.deepEqual(byHash.get(hashes.rename)!.files, [{ path: 'src/main.ts', status: 'R', from: 'src/app.ts', additions: 0, deletions: 0 }])
    const logo = byHash.get(hashes.app)!.files!.find((f) => f.path === 'logo.png')!
    assert.equal(logo.status, 'A')
    assert.equal(logo.additions, undefined, 'binary files have no line counts')
    assert.deepEqual(byHash.get(hashes.deleteLogo)!.files, [{ path: 'logo.png', status: 'D' }])
    assert.deepEqual(byHash.get(hashes.readme)!.stats, { files: 1, additions: 2, deletions: 0 })
  })

  it('finds pull requests and links them to their commits', () => {
    const byNumber = new Map(history.pullRequests.map((pr) => [pr.number, pr]))
    assert.equal(byNumber.get(1)?.title, 'Sign-in form')
    assert.equal(byNumber.get(1)?.source, 'feature/login')
    assert.equal(byNumber.get(2)?.title, 'Rename the app')
    const byHash = new Map(history.commits.map((c) => [c.hash, c]))
    assert.equal(byHash.get(hashes.merge)!.pr, 1)
    assert.equal(byHash.get(hashes.rename)!.pr, 2)
    assert.deepEqual(history.sources, { pullRequests: ['messages'] })
  })

  it('reads refs, HEAD, the default branch and the remote', () => {
    const refs = new Map(history.refs.map((r) => [`${r.type}:${r.name}`, r]))
    assert.deepEqual(refs.get('branch:main'), { name: 'main', type: 'branch', commit: hashes.deleteLogo, upstream: 'origin/main', ahead: 1 })
    assert.equal(refs.get('branch:feature/login')?.commit, hashes.loginTests)
    assert.equal(refs.get('branch:topic')?.commit, hashes.topic)
    assert.equal(refs.get('remote:origin/main')?.commit, hashes.rename)
    assert.deepEqual(refs.get('tag:v1.0'), { name: 'v1.0', type: 'tag', commit: hashes.rename, message: 'First release' })
    assert.ok(!refs.has('remote:origin/HEAD'))
    assert.deepEqual(history.repo.head, { branch: 'main', commit: hashes.deleteLogo })
    assert.equal(history.repo.defaultBranch, 'main')
    assert.deepEqual(history.repo.remotes, [{ name: 'origin', url: 'https://github.com/acme/demo.git' }])
    assert.deepEqual(history.repo.web, { host: 'github', url: 'https://github.com/acme/demo' })
  })

  it('counts uncommitted changes, and leaves them out of published histories', async () => {
    assert.equal(history.workingTree?.staged, 1)
    assert.equal(history.workingTree?.unstaged, 1)
    assert.equal(history.workingTree?.untracked, 1)
    const published = await readGitHistory(repo, { ...OPTIONS, publicOutput: true })
    assert.equal(published?.workingTree, undefined)
  })

  it('reuses the previous commits while refs are unchanged', async () => {
    const again = await readGitHistory(repo, { ...OPTIONS, previous: history })
    assert.equal(again?.fingerprint, history.fingerprint)
    assert.equal(again?.commits, history.commits, 'same array: git log did not run again')
  })

  it('keeps only the newest commits when asked to', async () => {
    const cut = await readGitHistory(repo, { ...OPTIONS, maxCommits: 3 })
    assert.equal(cut?.commits.length, 3)
    assert.equal(cut?.truncated, true)
    assert.equal(cut?.totalCommits, 9)
  })

  it('returns nothing outside a git repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'repomap-plain-'))
    assert.equal(await readGitHistory(plain, OPTIONS), undefined)
  })

  describe('pull requests from GitHub', () => {
    const cacheDir = join(sandbox, 'cache')
    const now = Date.parse('2026-02-01T12:00:00Z')
    const apiPulls = () => [
      {
        number: 3,
        title: 'Topic',
        state: 'open',
        draft: true,
        merged_at: null,
        closed_at: null,
        created_at: '2026-01-31T00:00:00Z',
        merge_commit_sha: 'not-in-history',
        html_url: 'https://github.com/acme/demo/pull/3',
        user: { login: 'ada' },
        head: { ref: 'topic', sha: hashes.topic },
        base: { ref: 'main' },
      },
      {
        number: 1,
        title: 'Sign-in form (edited)',
        state: 'closed',
        merged_at: '2026-01-01T06:00:00Z',
        closed_at: '2026-01-01T06:00:00Z',
        created_at: '2025-12-31T00:00:00Z',
        merge_commit_sha: hashes.merge,
        html_url: 'https://github.com/acme/demo/pull/1',
        user: { login: 'ada' },
        head: { ref: 'feature/login', sha: hashes.loginTests },
        base: { ref: 'main' },
      },
    ]
    const calls: { url: string; auth?: string }[] = []
    const fakeFetch = (status = 200) =>
      (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), auth: (init?.headers as Record<string, string>)?.Authorization })
        return new Response(status === 200 ? JSON.stringify(apiPulls()) : '{}', { status, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
    const github = { ...OPTIONS, github: 'auto' as const, cacheDir, env: {}, ghCommand: null }

    it('adds open and closed pull requests, preferring GitHub titles', async () => {
      const result = (await readGitHistory(repo, { ...github, fetch: fakeFetch(), now: () => now }))!
      assert.equal(calls.length, 1)
      assert.match(calls[0].url, /^https:\/\/api\.github\.com\/repos\/acme\/demo\/pulls\?state=all/)
      assert.equal(calls[0].auth, undefined, 'no token: anonymous request')
      const byNumber = new Map(result.pullRequests.map((pr) => [pr.number, pr]))
      assert.equal(byNumber.get(3)?.state, 'open')
      assert.equal(byNumber.get(3)?.draft, true)
      assert.equal(byNumber.get(3)?.mergeCommit, undefined)
      assert.equal(byNumber.get(3)?.headCommit, hashes.topic)
      assert.equal(byNumber.get(1)?.title, 'Sign-in form (edited)')
      assert.equal(byNumber.get(1)?.mergeCommit, hashes.merge)
      assert.equal(byNumber.get(2)?.origin, 'squash-message', 'local-only pull requests stay')
      assert.deepEqual(result.sources?.pullRequests, ['messages', 'github'])
      assert.ok(existsSync(join(cacheDir, '_github-pulls.json')))
    })

    it('answers from its cache for a while', async () => {
      await readGitHistory(repo, { ...github, fetch: fakeFetch(), now: () => now + 5 * 60_000 })
      assert.equal(calls.length, 1)
    })

    it('keeps the last answer when GitHub refuses', async () => {
      const result = (await readGitHistory(repo, { ...github, fetch: fakeFetch(403), now: () => now + 60 * 60_000 }))!
      assert.equal(calls.length, 2)
      assert.match(result.sources?.github?.error ?? '', /rate limited/)
      assert.ok(result.pullRequests.some((pr) => pr.number === 3), 'cached pull requests are still shown')
    })

    it('sends a token when one is set', async () => {
      rmSync(join(cacheDir, '_github-pulls.json'))
      await readGitHistory(repo, { ...github, env: { GITHUB_TOKEN: 'token-123' }, fetch: fakeFetch(), now: () => now })
      assert.equal(calls.at(-1)?.auth, 'Bearer token-123')
    })

    it('never asks GitHub for other hosts or when turned off', async () => {
      const before = calls.length
      await readGitHistory(repo, { ...github, github: 'off', fetch: fakeFetch() })
      assert.equal(calls.length, before)
    })
  })

  describe('git.json on disk', () => {
    it('is rewritten only when the history changes', async () => {
      const out = join(sandbox, 'out')
      const configPath = join(sandbox, 'repomap.config.json')
      writeFileSync(
        configPath,
        JSON.stringify({ name: 'demo', repoRoot: repo, output: join(out, 'graph.json'), layers: [{ id: 'app', label: 'App', color: '#fff' }], history: { github: 'off' } }),
      )
      const config = loadConfig(configPath)
      const log = createLogger({ quiet: true })
      const first = await updateGitHistory(config, { log })
      assert.equal(first.changed, true)
      assert.equal(first.path, join(out, 'git.json'))
      const text = readFileSync(first.path, 'utf8')
      assert.equal((await updateGitHistory(config, { log })).changed, false)
      assert.equal(readFileSync(first.path, 'utf8'), text, 'unchanged file is not rewritten')
      commitAll('One more commit')
      const third = await updateGitHistory(config, { log })
      assert.equal(third.changed, true)
      assert.equal(third.history?.commits.length, 10)
    })

    it('finds the history published beside a graph', () => {
      const dir = mkdtempSync(join(tmpdir(), 'repomap-beside-'))
      writeFileSync(join(dir, 'demo.graph.json'), '{}')
      assert.equal(historyBeside(join(dir, 'demo.graph.json')), join(dir, 'git.json'))
      writeFileSync(join(dir, 'demo.git.json'), '{}')
      assert.equal(historyBeside(join(dir, 'demo.graph.json')), join(dir, 'demo.git.json'))
      assert.equal(historyBeside(join(dir, 'graph.json')), join(dir, 'git.json'))
    })
  })
})
