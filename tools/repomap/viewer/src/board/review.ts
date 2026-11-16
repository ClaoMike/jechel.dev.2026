/**
 * Review mode in the viewer: a diff (from the server, or a commit's files from git.json), the chips it
 * touches, what depends on them and the tests that cover them; and the AI briefing.
 */
import { WRITE_HEADER } from '../../../src/shared/git-actions.ts'
import type { GitHistory } from '../../../src/shared/git-types.ts'
import { touchedNodes, WORKTREE, type ReviewDiff, type ReviewFile } from '../../../src/shared/review.ts'
import { computeImpact } from './impact.ts'
import type { BoardIndex } from './model.ts'
import { useBoard, type ReviewState } from './store.ts'

export function reviewFromFiles(bi: BoardIndex, files: ReviewFile[], meta: { base?: string; head: string; label: string; approximate?: boolean }): ReviewState {
  const ids = touchedNodes(bi.index.nodes, files)
  const touched = new Set<number>()
  for (const id of ids.keys()) {
    const i = bi.index.byId.get(id)
    if (i !== undefined) touched.add(i)
  }
  const { impacted, tests } = computeImpact(bi, touched)
  return { ...meta, files, touched, impacted, tests }
}

/** Loads a diff from the server (`head` = WORKTREE: uncommitted changes) and marks the board; false when it failed. */
export async function loadReview(bi: BoardIndex, base: string | undefined, head: string): Promise<boolean> {
  const store = useBoard.getState()
  store.setReviewLoading(true)
  try {
    const params = new URLSearchParams({ head, ...(base ? { base } : {}) })
    const response = await fetch(`api/review?${params}`, { cache: 'no-store' })
    const data = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as ReviewDiff & { error?: string }
    if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`)
    store.setReview(reviewFromFiles(bi, data.files, { base, head, label: data.label }))
    return true
  } catch (error) {
    store.setReviewLoading(false, (error as Error).message)
    return false
  }
}

/** Without a server: a commit's files from git.json (whole files: the history has no line ranges). */
export function reviewCommit(bi: BoardIndex, history: GitHistory, hash: string): void {
  const commit = history.commits.find((c) => c.hash === hash || c.hash.startsWith(hash))
  if (!commit) return
  const files: ReviewFile[] = (commit.files ?? []).map((f) => ({
    path: f.path,
    oldPath: f.from,
    status: f.status === 'A' ? 'added' : f.status === 'D' ? 'deleted' : f.status === 'R' ? 'renamed' : 'modified',
    added: f.additions ?? 0,
    removed: f.deletions ?? 0,
    ranges: [],
  }))
  useBoard.getState().setReview(reviewFromFiles(bi, files, { head: commit.hash, label: `${commit.hash.slice(0, 7)} ${commit.subject}`, approximate: true }))
}

/** Asks the server's AI for a briefing on the current review. */
export async function requestBriefing(bi: BoardIndex): Promise<void> {
  const store = useBoard.getState()
  const review = store.review
  if (!review) return
  store.setBriefing({ loading: true })
  const ids = (set: Iterable<number>) => [...set].map((i) => bi.index.nodes[i].id)
  try {
    const response = await fetch('api/board/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' },
      body: JSON.stringify({
        base: review.base,
        head: review.head,
        touched: ids(new Set([...review.touched].map((i) => bi.rootOf[i]))),
        impacted: ids(review.impacted),
        tests: ids(review.tests),
      }),
    })
    const data = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as { markdown?: string; error?: string }
    if (!response.ok || !data.markdown) throw new Error(data.error ?? `HTTP ${response.status}`)
    useBoard.getState().setBriefing({ loading: false, markdown: data.markdown })
  } catch (error) {
    useBoard.getState().setBriefing({ loading: false, error: (error as Error).message })
  }
}

export { WORKTREE }
