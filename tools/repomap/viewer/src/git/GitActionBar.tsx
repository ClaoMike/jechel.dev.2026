/**
 * The History tab's command bar (when `repomap serve` runs git commands): the current branch and
 * its menu (switch, new, merge, rebase, rename), the sync button that does what's due — publish,
 * pull, push or fetch — like GitHub Desktop, the uncommitted changes, and banners for a merge in
 * progress or a command that failed.
 */
import { useState } from 'react'
import { branchUrl, newPullRequestUrl, WORKTREE } from '../../../src/shared/git-types.ts'
import { Icon } from '../ui/icons.tsx'
import { ActionMenu, type MenuItem } from '../ui/ActionMenu.tsx'
import { confirmThen, useGitActions } from './actions.ts'
import type { GitModel } from './model.ts'
import { useGit } from './store.ts'

export function GitActionBar({ model }: { model: GitModel }) {
  const available = useGitActions((s) => s.available)
  const live = useGitActions((s) => s.live)
  const busy = useGitActions((s) => s.busy)
  if (!available || !live) return null
  const { run, openDialog } = useGitActions.getState()
  const history = model.history
  const branch = live.branch
  const current = branch ?? 'HEAD'
  const locals = history.refs.filter((r) => r.type === 'branch').map((r) => r.name).sort((a, b) => a.localeCompare(b))
  const localSet = new Set(locals)
  const remoteNames = history.repo.remotes.map((r) => r.name)
  const remoteOnly = history.refs
    .filter((r) => r.type === 'remote' && !r.name.endsWith('/HEAD'))
    .map((r) => r.name)
    .filter((name) => {
      const remote = remoteNames.find((n) => name.startsWith(`${n}/`))
      return !localSet.has(remote ? name.slice(remote.length + 1) : name)
    })
    .sort((a, b) => a.localeCompare(b))
  const published = !!live.upstream && !live.upstreamGone
  const web = history.repo.web
  const base = history.repo.defaultBranch
  const prUrl = branch && published && base && branch !== base ? newPullRequestUrl(web, base, branch) : undefined
  const onBranchPage = branch && published ? branchUrl(web, branch) : undefined
  const changes = live.files.length
  const conflicts = live.files.filter((f) => f.conflicted).length

  const branchItems: MenuItem[] = [
    { heading: 'Switch to' },
    ...locals.map<MenuItem>((name) => ({
      label: name,
      icon: name === branch ? 'check' : 'branch',
      disabled: name === branch || !!busy,
      hint: name === base ? 'default' : undefined,
      onSelect: () => void run({ type: 'checkout', ref: name, target: 'branch' }),
    })),
    ...remoteOnly.map<MenuItem>((name) => ({
      label: name,
      icon: 'branch',
      hint: 'remote',
      disabled: !!busy,
      title: `Check out ${name} as a local branch that tracks it`,
      onSelect: () => void run({ type: 'checkout', ref: name, target: 'remote' }),
    })),
    { separator: true },
    { label: 'New branch…', icon: 'plus', hint: 'from HEAD', disabled: !live.head, onSelect: () => openDialog({ kind: 'create-branch' }) },
    { label: `Merge into ${current}…`, icon: 'merge', disabled: !live.head || !!live.operation, onSelect: () => openDialog({ kind: 'pick-branch', purpose: 'merge' }) },
    { label: `Squash and merge into ${current}…`, icon: 'merge', disabled: !live.head || !!live.operation, onSelect: () => openDialog({ kind: 'pick-branch', purpose: 'squash' }) },
    { label: `Rebase ${current}…`, icon: 'branch', disabled: !branch || !!live.operation, onSelect: () => openDialog({ kind: 'pick-branch', purpose: 'rebase' }) },
    ...(branch ? [{ label: `Rename ${branch}…`, icon: 'edit', onSelect: () => openDialog({ kind: 'rename-branch', name: branch }) } satisfies MenuItem] : []),
  ]

  const moreItems: MenuItem[] = [
    { label: 'Fetch', icon: 'sync', hint: live.remote, disabled: !live.remote, onSelect: () => void run({ type: 'fetch' }) },
    { label: 'Pull', icon: 'pull', hint: live.upstream, disabled: !published, onSelect: () => void run({ type: 'pull' }) },
    { label: published ? 'Push' : 'Publish branch', icon: 'push', disabled: !branch || !live.remote, onSelect: () => void run({ type: 'push' }) },
    {
      label: 'Force push…',
      icon: 'push',
      danger: true,
      disabled: !published,
      onSelect: () =>
        confirmThen(
          `Force push ${branch}?`,
          `This replaces ${live.upstream} with your ${branch}. Commits on the remote that you don't have are lost (unless someone pushed since your last fetch: then it is refused).`,
          'Force push',
          { type: 'push', force: true },
        ),
    },
    { separator: true },
    { label: 'Stash all changes…', icon: 'stash', disabled: changes === 0, onSelect: () => openDialog({ kind: 'stash' }) },
    ...live.stashes.slice(0, 5).map<MenuItem>((stash) => ({
      label: `Restore “${stash.message}”`,
      icon: 'stash',
      title: 'Apply the stash and drop it',
      onSelect: () => void run({ type: 'stash-pop', index: stash.index }),
    })),
    ...(prUrl || onBranchPage ? [{ separator: true } satisfies MenuItem] : []),
    ...(prUrl ? [{ label: 'Create pull request', icon: 'pr', hint: `into ${base}`, onSelect: () => window.open(prUrl, '_blank', 'noopener') } satisfies MenuItem] : []),
    ...(onBranchPage ? [{ label: 'View branch on the web', icon: 'external', onSelect: () => window.open(onBranchPage, '_blank', 'noopener') } satisfies MenuItem] : []),
  ]

  const showChanges = () => {
    const git = useGit.getState()
    if (!git.filters.worktree) git.setFilters({ worktree: true })
    git.select(WORKTREE)
  }

  return (
    <>
      <div className="git-actionbar" data-testid="git-actions" aria-busy={!!busy}>
        <ActionMenu label="Current branch" items={branchItems} className="git-bar-button branch-button" testId="branch-menu" title="Current branch: switch, create, merge">
          <Icon name="branch" size={15} />
          <span className="git-bar-text">
            <span className="git-bar-caption">Current branch</span>
            <span className="git-bar-value" data-testid="current-branch">
              {branch ?? `detached at ${live.head?.slice(0, 7) ?? '—'}`}
            </span>
          </span>
          <Icon name="caret" size={14} />
        </ActionMenu>
        <SyncButton />
        {changes > 0 && (
          <button type="button" className="git-bar-button" onClick={showChanges} data-testid="changes-button" title="Review and commit your changes">
            <span className="changes-dot" aria-hidden="true" />
            <span className="git-bar-text">
              <span className="git-bar-caption">Uncommitted</span>
              <span className="git-bar-value">
                {changes} changed {changes === 1 ? 'file' : 'files'}
              </span>
            </span>
          </button>
        )}
        <ActionMenu label="More git commands" items={moreItems} className="icon-button" testId="git-more">
          <Icon name="more" />
        </ActionMenu>
        {busy && (
          <span className="git-busy" role="status" data-testid="git-busy">
            <span className="spinner small" aria-hidden="true" /> {busy}
          </span>
        )}
      </div>
      {live.operation && (
        <div className="git-banner warn" role="status" data-testid="operation-banner">
          <Icon name="warn" size={15} />
          <span>
            <strong>{OPERATION_LABEL[live.operation]} in progress.</strong>{' '}
            {conflicts > 0 ? `${conflicts} ${conflicts === 1 ? 'file has' : 'files have'} conflicts: edit them, then continue.` : 'No conflicts left: continue to finish it.'}
          </span>
          {conflicts > 0 && (
            <button type="button" className="chip" onClick={showChanges}>
              Show conflicts
            </button>
          )}
          <button type="button" className="chip solid-accent" disabled={!!busy} onClick={() => void run({ type: 'continue' })}>
            {live.operation === 'merge' ? 'Commit merge' : `Continue ${live.operation}`}
          </button>
          <button
            type="button"
            className="chip"
            disabled={!!busy}
            onClick={() => confirmThen(`Abort the ${live.operation}?`, 'Your branch goes back to where it was before it started; conflict resolutions are lost.', 'Abort', { type: 'abort' })}
          >
            Abort
          </button>
        </div>
      )}
      <FailureBanner />
    </>
  )
}

const OPERATION_LABEL = { merge: 'Merge', rebase: 'Rebase', 'cherry-pick': 'Cherry-pick', revert: 'Revert' } as const

/** Does what's due, like GitHub Desktop: publish a new branch, pull what's behind, push what's ahead, else fetch. */
function SyncButton() {
  const live = useGitActions((s) => s.live)!
  const busy = useGitActions((s) => s.busy)
  const { run } = useGitActions.getState()
  if (!live.remote) return null
  const published = !!live.upstream && !live.upstreamGone
  let label: string
  let caption: string
  let icon: 'push' | 'pull' | 'sync'
  let action: Parameters<typeof run>[0]
  if (live.branch && !published) {
    label = 'Publish branch'
    caption = live.upstreamGone ? `${live.upstream} was deleted` : `to ${live.remote}`
    icon = 'push'
    action = { type: 'push' }
  } else if (live.branch && live.behind > 0) {
    label = `Pull ${live.remote}`
    caption = `${live.behind} behind${live.ahead ? `, ${live.ahead} ahead` : ''}`
    icon = 'pull'
    action = { type: 'pull' }
  } else if (live.branch && live.ahead > 0) {
    label = `Push ${live.remote}`
    caption = `${live.ahead} ${live.ahead === 1 ? 'commit' : 'commits'} to push`
    icon = 'push'
    action = { type: 'push' }
  } else {
    label = `Fetch ${live.remote}`
    caption = live.upstream ? `up to date with ${live.upstream}` : 'check for new commits'
    icon = 'sync'
    action = { type: 'fetch' }
  }
  return (
    <button type="button" className="git-bar-button sync-button" onClick={() => void run(action)} disabled={!!busy} data-testid="sync" title={`${label} (${caption})`}>
      <Icon name={icon} size={15} />
      <span className="git-bar-text">
        <span className="git-bar-caption">{caption}</span>
        <span className="git-bar-value">
          {label}
          {live.behind > 0 && published && <span className="sync-count"> ↓{live.behind}</span>}
          {live.ahead > 0 && published && <span className="sync-count"> ↑{live.ahead}</span>}
        </span>
      </span>
    </button>
  )
}

function FailureBanner() {
  const failure = useGitActions((s) => s.failure)
  const [details, setDetails] = useState(false)
  if (!failure) return null
  const extra = failure.output && failure.output.trim() !== failure.message.trim()
  return (
    <div className="git-banner error" role="alert" data-testid="git-failure">
      <Icon name="warn" size={15} />
      <div className="git-banner-text">
        <span>
          <strong>git:</strong> {failure.message}
        </span>
        {details && extra && <pre className="git-output">{failure.output}</pre>}
      </div>
      {extra && (
        <button type="button" className="chip" onClick={() => setDetails(!details)} aria-expanded={details}>
          {details ? 'Hide output' : 'Show output'}
        </button>
      )}
      <button type="button" className="icon-button small" onClick={() => useGitActions.getState().dismissFailure()} aria-label="Dismiss the error">
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}
