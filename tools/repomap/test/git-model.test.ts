/**
 * The History tab's pure logic: lanes, which commits show under ref filters, badges, search.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WORKTREE, type GitCommit, type GitHistory } from '../src/shared/git-types.ts'
import { edgePath, layoutLanes, type LaneInput } from '../viewer/src/git/lanes.ts'
import {
  buildGitModel,
  commitMatches,
  containingRefs,
  DEFAULT_FILTERS,
  findMatches,
  historyUrlsFor,
  initials,
  mergedBranch,
  mergeTarget,
  refBadges,
  relativeTime,
  touchesPath,
} from '../viewer/src/git/model.ts'

const rows = (spec: string): LaneInput[] =>
  spec.split(' ').map((entry) => {
    const [hash, parents = ''] = entry.split(':')
    return { hash, parents: parents ? parents.split(',') : [] }
  })

describe('lane layout', () => {
  it('keeps a straight history in one lane', () => {
    const layout = layoutLanes(rows('c:b b:a a'))
    assert.deepEqual([...layout.lane], [0, 0, 0])
    assert.equal(layout.width, 1)
    assert.deepEqual(layout.edges.map((e) => [e.from, e.to, e.lane]), [[0, 1, 0], [1, 2, 0]])
  })

  it('opens a lane for a merged branch and closes it at the fork', () => {
    // m3 merges b2 into main; b1 forked from m1.
    const layout = layoutLanes(rows('m3:m2,b2 b2:b1 m2:m1 b1:m1 m1:m0 m0'))
    assert.deepEqual([...layout.lane], [0, 1, 0, 1, 0, 0])
    assert.equal(layout.width, 2)
    const merge = layout.edges.find((e) => e.from === 0 && e.merge)!
    assert.deepEqual([merge.fromLane, merge.lane, merge.to], [0, 1, 1])
    const fork = layout.edges.find((e) => e.from === 3)!
    assert.deepEqual([fork.fromLane, fork.lane, fork.toLane, fork.to], [1, 1, 0, 4], 'the branch bends back into main at its fork point')
    assert.notEqual(layout.color[1], layout.color[0], 'the branch has its own colour')
  })

  it('keeps reserved tips (the trunk) in the leftmost lane', () => {
    assert.deepEqual([...layoutLanes(rows('x:root main:root root')).lane], [0, 1, 0])
    assert.deepEqual([...layoutLanes(rows('x:root main:root root'), ['main']).lane], [1, 0, 0])
  })

  it('reuses lanes that became free', () => {
    // b's line ends at its root commit y, so the next tip (c) takes that lane instead of a new one.
    const layout = layoutLanes(rows('a:r b:y y c:r r'))
    assert.deepEqual([...layout.lane], [0, 1, 1, 1, 0])
    assert.equal(layout.width, 2)
    // Two lines heading to the same parent stay side by side until they meet there.
    assert.deepEqual([...layoutLanes(rows('a:r b:x x:r c:r r')).lane], [0, 1, 1, 2, 0])
  })

  it('handles octopus merges and parents cut off by a history limit', () => {
    const octopus = layoutLanes(rows('o:a,b,c a b c'))
    assert.deepEqual([...octopus.lane], [0, 0, 1, 2])
    const cut = layoutLanes(rows('c:missing'))
    assert.equal(cut.edges[0].to, 1, 'runs off the bottom')
    assert.equal(cut.edges[0].toLane, cut.edges[0].lane)
  })

  it('draws straight lines, bends and merges', () => {
    const x = (lane: number) => 10 + lane * 16
    const y = (row: number) => row * 30 + 15
    assert.equal(edgePath({ from: 0, to: 2, fromLane: 0, toLane: 0, lane: 0, color: 0, merge: false }, x, y), 'M10 15L10 75')
    const adjacent = edgePath({ from: 0, to: 1, fromLane: 0, toLane: 1, lane: 1, color: 0, merge: true }, x, y)
    assert.equal(adjacent, 'M10 15C10 30 26 30 26 45')
    const long = edgePath({ from: 0, to: 4, fromLane: 0, toLane: 2, lane: 1, color: 0, merge: true }, x, y)
    assert.match(long, /^M10 15C.* 26 45L26 105C.* 42 135$/)
  })
})

const c = (hash: string, parents: string[], subject: string, extra: Partial<GitCommit> = {}): GitCommit => ({
  hash,
  parents,
  author: 'Ada Park',
  date: 1_700_000_000,
  subject,
  ...extra,
})

const history: GitHistory = {
  kind: 'repomap-git',
  version: 1,
  generatedAt: '2026-01-01T00:00:00Z',
  repo: { name: 'demo', head: { branch: 'main', commit: 'm3' }, defaultBranch: 'main', remotes: [{ name: 'origin', url: 'https://x' }] },
  commits: [
    c('m3', ['m2', 'b2'], 'Merge pull request #2 from acme/feature/b', { pr: 2, files: [{ path: 'src/b.ts', status: 'A' }] }),
    c('b2', ['b1'], 'B tests', { files: [{ path: 'src/b.test.ts', status: 'A' }] }),
    c('a1', ['m1'], 'Work on A', { author: 'Lena Novak', files: [{ path: 'src/new.ts', status: 'R', from: 'src/old.ts' }] }),
    c('m2', ['m1'], 'Tweak the README', { files: [{ path: 'README.md', status: 'M' }] }),
    c('b1', ['m1'], 'Start B', { files: [{ path: 'src/b.ts', status: 'A' }] }),
    c('m1', ['m0'], 'Add the app', { files: [{ path: 'src/app.ts', status: 'A' }] }),
    c('m0', [], 'Initial commit'),
  ],
  refs: [
    { name: 'main', type: 'branch', commit: 'm3', upstream: 'origin/main', ahead: 1 },
    { name: 'feature/a', type: 'branch', commit: 'a1' },
    { name: 'origin/main', type: 'remote', commit: 'm2' },
    { name: 'v1', type: 'tag', commit: 'm1' },
  ],
  pullRequests: [
    { number: 3, title: 'Feature A', state: 'open', headCommit: 'a1', source: 'feature/a', origin: 'github' },
    { number: 2, title: 'Feature B', state: 'merged', mergeCommit: 'm3', source: 'feature/b', target: 'main', origin: 'merge-message' },
  ],
  workingTree: { staged: 1, unstaged: 0, untracked: 0, conflicted: 0, files: [{ path: 'x.ts', status: 'A ' }] },
}

describe('history model', () => {
  const model = buildGitModel(history)

  it('shows every commit, uncommitted changes on top', () => {
    assert.deepEqual(model.rows.map((r) => r.hash), [WORKTREE, 'm3', 'b2', 'a1', 'm2', 'b1', 'm1', 'm0'])
    assert.equal(model.hiddenCommits, 0)
    assert.equal(model.rowOf.get('m3'), 1)
  })

  it('keeps the default branch in the leftmost lane', () => {
    assert.equal(model.mainRef?.name, 'main')
    for (const hash of ['m3', 'm2', 'm1', 'm0']) assert.equal(model.lanes.lane[model.rowOf.get(hash)!], 0, hash)
  })

  it('places refs, pull requests and names of merged branches', () => {
    assert.deepEqual(model.refsAt.get('m3')?.map((r) => r.name), ['main'])
    assert.deepEqual(model.prsAt.get('m3')?.map((pr) => pr.number), [2])
    assert.deepEqual(model.prsAt.get('a1')?.map((pr) => pr.number), [3])
    assert.equal(model.ghostAt.get('b2'), 'feature/b')
    assert.deepEqual(model.children.get('m1')?.sort(), ['a1', 'b1', 'm2'])
  })

  it('hides commits only hidden refs reach', () => {
    const noA = buildGitModel(history, { ...DEFAULT_FILTERS, hiddenRefs: ['branch:feature/a'] })
    assert.ok(!noA.rowOf.has('a1'))
    assert.equal(noA.hiddenCommits, 1)
    const noRemotes = buildGitModel(history, { ...DEFAULT_FILTERS, remotes: false })
    assert.equal(noRemotes.hiddenCommits, 0, 'main still reaches what origin/main does')
    assert.ok(!noRemotes.visibleRefs.some((r) => r.type === 'remote'))
    const onlyA = buildGitModel(history, { ...DEFAULT_FILTERS, hiddenRefs: ['branch:main', 'remote:origin/main', 'tag:v1'] })
    assert.deepEqual(onlyA.rows.map((r) => r.hash), ['a1', 'm1', 'm0'], 'no uncommitted row: HEAD is hidden')
    const noTree = buildGitModel(history, { ...DEFAULT_FILTERS, worktree: false })
    assert.equal(noTree.rows[0].hash, 'm3')
  })

  it('keeps a detached HEAD visible whatever is hidden', () => {
    const detached = { ...history, repo: { ...history.repo, head: { commit: 'a1' } } }
    const model = buildGitModel(detached, { ...DEFAULT_FILTERS, hiddenRefs: ['branch:feature/a'] })
    assert.ok(model.rowOf.has('a1'))
  })

  it('searches messages, authors, hashes, files and pull request numbers', () => {
    const byHash = new Map(history.commits.map((commit) => [commit.hash, commit]))
    assert.ok(commitMatches(byHash.get('m2')!, 'readme', model))
    assert.ok(commitMatches(byHash.get('a1')!, 'lena', model))
    assert.ok(commitMatches(byHash.get('a1')!, 'old.ts', model), 'renamed-from paths')
    assert.ok(commitMatches(byHash.get('m3')!, '#2', model))
    assert.ok(!commitMatches(byHash.get('m2')!, '#2', model))
    assert.ok(commitMatches(byHash.get('m3')!, 'merge feature', model), 'every word, anywhere')
    assert.ok(!commitMatches(byHash.get('m3')!, 'merge missing', model))
    assert.ok(commitMatches({ ...byHash.get('m0')!, hash: 'deadbeef00' }, 'dead', model), 'hash prefix')
    assert.equal(findMatches(model, '  ', null), null)
    assert.deepEqual(findMatches(model, 'b', null)?.map((row) => model.rows[row].hash), ['m3', 'b2', 'b1'])
  })

  it('follows a file, a renamed file and a folder', () => {
    const byHash = new Map(history.commits.map((commit) => [commit.hash, commit]))
    assert.ok(touchesPath(byHash.get('b1')!, 'src/b.ts'))
    assert.ok(touchesPath(byHash.get('a1')!, 'src/old.ts'))
    assert.ok(touchesPath(byHash.get('m1')!, 'src/'))
    assert.ok(!touchesPath(byHash.get('m2')!, 'src/'))
    assert.deepEqual(findMatches(model, '', 'src/b.ts')?.map((row) => model.rows[row].hash), ['m3', 'b1'])
  })

  it('knows which refs contain a commit', () => {
    assert.deepEqual(containingRefs(model, 'm1').map((r) => r.name).sort(), ['feature/a', 'main', 'origin/main', 'v1'])
    assert.deepEqual(containingRefs(model, 'a1').map((r) => r.name), ['feature/a'])
    assert.deepEqual(containingRefs(model, 'b1').map((r) => r.name), ['main'])
  })
})

describe('ref badges', () => {
  it('merges a branch with its remote twin and puts HEAD first, tags last', () => {
    const badges = refBadges(
      [
        { name: 'v2', type: 'tag', commit: 'x' },
        { name: 'origin/dev', type: 'remote', commit: 'x' },
        { name: 'main', type: 'branch', commit: 'x' },
        { name: 'origin/main', type: 'remote', commit: 'x' },
        { name: 'upstream/main', type: 'remote', commit: 'x' },
      ],
      ['origin', 'upstream'],
      'main',
    )
    assert.deepEqual(
      badges.map((b) => [b.label, b.type, b.local, b.remotes.join(','), b.head]),
      [
        ['main', 'branch', true, 'origin,upstream', true],
        ['dev', 'branch', false, 'origin', false],
        ['v2', 'tag', false, '', false],
      ],
    )
  })
})

describe('merge messages', () => {
  it('names the merged branch and its target', () => {
    assert.equal(mergedBranch('Merge pull request #5 from owner/feat/x'), 'feat/x')
    assert.equal(mergedBranch("Merge branch 'dev' into main"), 'dev')
    assert.equal(mergedBranch("Merge remote-tracking branch 'origin/dev'"), 'origin/dev')
    assert.equal(mergedBranch('Merged in hotfix (pull request #9)'), 'hotfix')
    assert.equal(mergedBranch('Fix a bug'), undefined)
    assert.equal(mergeTarget("Merge branch 'dev' into main"), 'main')
    assert.equal(mergeTarget("Merge branch 'a' into 'b'"), 'b')
    assert.equal(mergeTarget("Merge branch 'a' of github.com:x/y into feature"), 'feature')
    assert.equal(mergeTarget('Merge pull request #5 from owner/x'), undefined)
  })
})

describe('formatting and loading helpers', () => {
  it('writes relative times', () => {
    const now = 1_800_000_000
    assert.equal(relativeTime(now - 20, now), 'just now')
    assert.equal(relativeTime(now - 120, now), '2 min ago')
    assert.equal(relativeTime(now - 3 * 3600, now), '3 h ago')
    assert.equal(relativeTime(now - 36 * 3600, now), 'yesterday')
    assert.equal(relativeTime(now - 3 * 86_400, now), '3 days ago')
    assert.ok(!/ago/.test(relativeTime(now - 40 * 86_400, now)), 'older: a date')
  })

  it('makes avatar initials', () => {
    assert.equal(initials('Ada Park'), 'AP')
    assert.equal(initials('Mary Ann Smith'), 'MS')
    assert.equal(initials('dependabot[bot]'), 'DE')
    assert.equal(initials('x'), 'X')
    assert.equal(initials(''), '?')
  })

  it('finds the history published beside a graph URL', () => {
    assert.deepEqual(historyUrlsFor('samples/demo.graph.json', 'https://site.dev/app/'), [
      'https://site.dev/app/samples/demo.git.json',
      'https://site.dev/app/samples/git.json',
    ])
    assert.deepEqual(historyUrlsFor('https://cdn.dev/x/graph.json', 'https://site.dev/'), ['https://cdn.dev/x/git.json'])
  })
})
