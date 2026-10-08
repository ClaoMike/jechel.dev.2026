/**
 * Branches, remote branches, tags and pull requests. The checkboxes hide a ref and the commits only
 * it reaches (⌥-click or the target button: only this one); clicking a name jumps to its commit.
 */
import { useState, type MouseEvent } from 'react'
import { newPullRequestUrl, pullRequestUrl, type GitPullRequest, type GitRef } from '../../../src/shared/git-types.ts'
import { useViewer } from '../model/store.ts'
import { Icon } from '../ui/icons.tsx'
import { Section, Toggle } from '../ui/Sidebar.tsx'
import { ActionMenu, type MenuItem } from '../ui/ActionMenu.tsx'
import { confirmThen, useGitActions } from './actions.ts'
import { jumpToRef } from './CommitDetails.tsx'
import { isRefVisible, refKey, relativeTime, type GitModel } from './model.ts'
import { CloudIcon, laneColor, PR_STATE_LABEL, prState } from './parts.tsx'
import { useGit } from './store.ts'

type PrFilter = 'all' | 'open' | 'merged' | 'closed'

export function RefsPanel({ model }: { model: GitModel | null }) {
  const open = useGit((s) => s.panelOpen)
  const filters = useGit((s) => s.filters)
  const [prFilter, setPrFilter] = useState<PrFilter>('all')
  const { setFilters, resetFilters, setPanel } = useGit.getState()
  const canRun = useGitActions((s) => !!s.available && !!s.live?.head)

  if (!model) return <aside className={`sidebar git-panel${open ? ' open' : ''}`} aria-label="Branches and pull requests" />
  const history = model.history
  const head = history.repo.head
  const main = history.repo.defaultBranch
  const rank = (ref: GitRef) => (ref.name === head?.branch ? 0 : ref.name === main ? 1 : 2)
  const locals = history.refs.filter((r) => r.type === 'branch').sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  const remotes = history.refs.filter((r) => r.type === 'remote').sort((a, b) => a.name.localeCompare(b.name))
  const commitOrder = new Map(history.commits.map((c, i) => [c.hash, i]))
  const tags = history.refs.filter((r) => r.type === 'tag').sort((a, b) => (commitOrder.get(a.commit) ?? 1e9) - (commitOrder.get(b.commit) ?? 1e9))
  const prCounts = { all: history.pullRequests.length, open: 0, merged: 0, closed: 0 }
  for (const pr of history.pullRequests) prCounts[pr.state]++
  const prs = history.pullRequests.filter((pr) => prFilter === 'all' || pr.state === prFilter)
  const shownCommits = model.rows.length - (model.history.workingTree && filters.worktree && model.rows[0]?.commit === null ? 1 : 0)
  const github = history.sources?.github

  return (
    <aside className={`sidebar git-panel${open ? ' open' : ''}`} aria-label="Branches and pull requests" data-testid="git-panel">
      <div className="drawer-header narrow-only">
        <strong>Branches &amp; pull requests</strong>
        <button type="button" className="icon-button" onClick={() => setPanel(false)} aria-label="Close branches panel">
          <Icon name="close" />
        </button>
      </div>
      <div className="sidebar-scroll">
        <Section
          title={`Branches (${locals.length})`}
          aside={
            canRun ? (
              <button
                type="button"
                className="icon-button small"
                onClick={() => useGitActions.getState().openDialog({ kind: 'create-branch' })}
                aria-label="New branch"
                title="New branch from HEAD"
                data-testid="new-branch"
              >
                <Icon name="plus" size={14} />
              </button>
            ) : undefined
          }
        >
          {locals.length === 0 && <p className="panel-empty">No local branches.</p>}
          {locals.map((ref) => (
            <RefRow key={refKey(ref)} gitRef={ref} model={model} head={ref.name === head?.branch} main={ref.name === main} />
          ))}
        </Section>

        {remotes.length > 0 && (
          <Section
            title={`Remote (${remotes.length})`}
            aside={<SectionSwitch label="Show remote branches" checked={filters.remotes} onChange={(v) => setFilters({ remotes: v })} />}
          >
            {remotes.map((ref) => (
              <RefRow key={refKey(ref)} gitRef={ref} model={model} disabled={!filters.remotes} />
            ))}
          </Section>
        )}

        {tags.length > 0 && (
          <Section title={`Tags (${tags.length})`} aside={<SectionSwitch label="Show tags" checked={filters.tags} onChange={(v) => setFilters({ tags: v })} />}>
            {tags.map((ref) => (
              <RefRow key={refKey(ref)} gitRef={ref} model={model} disabled={!filters.tags} />
            ))}
          </Section>
        )}

        <Section title={`Pull requests (${history.pullRequests.length})`}>
          {history.pullRequests.length > 0 && (
            <div className="presets" role="group" aria-label="Pull request state">
              {(['all', 'open', 'merged', 'closed'] as const)
                .filter((state) => state === 'all' || prCounts[state] > 0)
                .map((state) => (
                  <button
                    key={state}
                    type="button"
                    className={`chip${prFilter === state ? ' active' : ''}`}
                    aria-pressed={prFilter === state}
                    onClick={() => setPrFilter(state)}
                  >
                    {state === 'all' ? 'All' : PR_STATE_LABEL[state]} <span className="facet-count">{prCounts[state]}</span>
                  </button>
                ))}
            </div>
          )}
          {history.pullRequests.length === 0 && (
            <p className="panel-empty">
              None found. Merged pull requests are recognised from merge and squash commit messages
              {history.repo.web?.host === 'github' ? '; open ones come from GitHub.' : '.'}
            </p>
          )}
          <ul className="plain pr-list">
            {prs.map((pr) => (
              <PrRow key={pr.number} pr={pr} model={model} />
            ))}
          </ul>
          <p className="panel-source">
            {history.sources?.pullRequests.includes('github')
              ? `From merge messages and GitHub${github?.fetchedAt ? ` (${relativeTime(Date.parse(github.fetchedAt) / 1000)})` : ''}.`
              : 'From merge and squash commit messages.'}
            {github?.error && <span className="panel-warning"> GitHub: {github.error}.</span>}
          </p>
        </Section>

        {history.workingTree && (
          <Section title="Show" defaultOpen={false}>
            <Toggle label="Uncommitted changes" hint="A row above HEAD with the files you changed" checked={filters.worktree} onChange={(v) => setFilters({ worktree: v })} />
          </Section>
        )}
      </div>
      <footer className="sidebar-footer">
        <span>
          <strong>{shownCommits}</strong>/{history.commits.length} commits
        </span>
        <button type="button" className="link-button" onClick={resetFilters} title="Show every branch, tag and remote">
          <Icon name="reset" size={13} /> Reset
        </button>
      </footer>
    </aside>
  )
}

function RefRow({ gitRef, model, head = false, main = false, disabled = false }: { gitRef: GitRef; model: GitModel; head?: boolean; main?: boolean; disabled?: boolean }) {
  const theme = useViewer((s) => s.theme)
  const filters = useGit((s) => s.filters)
  const { toggleRef, soloRef } = useGit.getState()
  const key = refKey(gitRef)
  const shown = isRefVisible(gitRef, filters)
  const row = model.rowOf.get(gitRef.commit)
  const color = row !== undefined ? laneColor(model.lanes.color[row], theme) : 'var(--faint)'
  const toggle = (event: MouseEvent) => {
    if (event.altKey) soloRef(key)
    else toggleRef(key)
  }
  const tracking = [
    gitRef.ahead ? `${gitRef.ahead} commit${gitRef.ahead === 1 ? '' : 's'} ahead of ${gitRef.upstream}` : '',
    gitRef.behind ? `${gitRef.behind} behind` : '',
    gitRef.gone ? `${gitRef.upstream} was deleted on the remote` : '',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <div className={`facet-row ref-row${shown ? '' : ' hide'}`} data-testid={`ref-${key}`} title={gitRef.message || tracking || undefined}>
      <span className="expander-space" />
      <button
        type="button"
        role="checkbox"
        aria-checked={shown}
        className={`check${shown ? ' on' : ''}`}
        onClick={toggle}
        aria-label={`Show ${gitRef.name}`}
        disabled={disabled}
      />
      <button type="button" className="facet-label" onClick={() => jumpToRef(gitRef, model)} title={`Go to ${gitRef.name}'s newest commit`}>
        {gitRef.type === 'tag' ? (
          <span className="ref-icon tag-icon">
            <Icon name="tag" size={12} />
          </span>
        ) : gitRef.type === 'remote' ? (
          <span className="ref-icon" style={{ color }}>
            <CloudIcon />
          </span>
        ) : (
          <span className="swatch round" style={{ background: color }} />
        )}
        <span className="facet-text">{gitRef.name}</span>
        {head && <span className="mini-chip head">HEAD</span>}
        {main && !head && <span className="mini-chip">default</span>}
      </button>
      {(gitRef.ahead || gitRef.behind || gitRef.gone) && (
        <span className="tracking" title={tracking}>
          {gitRef.ahead ? <span>↑{gitRef.ahead}</span> : null}
          {gitRef.behind ? <span>↓{gitRef.behind}</span> : null}
          {gitRef.gone ? <span className="gone">gone</span> : null}
        </span>
      )}
      <button type="button" className="dim-toggle" onClick={() => soloRef(key)} title="Only this one (⌥-click the box)" aria-label={`Only ${gitRef.name}`} disabled={disabled}>
        <Icon name="focus" size={13} />
      </button>
      <RefMenu gitRef={gitRef} model={model} />
    </div>
  )
}

/** Git commands on a branch, remote branch or tag (when `repomap serve` runs them). */
function RefMenu({ gitRef, model }: { gitRef: GitRef; model: GitModel }) {
  const available = useGitActions((s) => s.available)
  const live = useGitActions((s) => s.live)
  const busy = useGitActions((s) => s.busy)
  if (!available || !live) return null
  const { run, openDialog } = useGitActions.getState()
  const current = live.branch ?? 'HEAD'
  const name = gitRef.name
  const busyOrStuck = !!busy || !!live.operation
  const history = model.history
  let items: MenuItem[]
  if (gitRef.type === 'branch') {
    const checkedOut = name === live.branch
    const base = history.repo.defaultBranch
    const prUrl = gitRef.upstream && base && name !== base ? newPullRequestUrl(history.repo.web, base, name) : undefined
    items = [
      { label: 'Switch to it', icon: 'check', disabled: checkedOut || !!busy, onSelect: () => void run({ type: 'checkout', ref: name, target: 'branch' }) },
      { label: `Merge into ${current}`, icon: 'merge', disabled: checkedOut || busyOrStuck, onSelect: () => void run({ type: 'merge', ref: name }) },
      { label: `Squash and merge into ${current}`, icon: 'merge', disabled: checkedOut || busyOrStuck, onSelect: () => void run({ type: 'merge', ref: name, squash: true }) },
      {
        label: `Rebase ${current} onto it`,
        icon: 'branch',
        disabled: checkedOut || busyOrStuck || !live.branch,
        onSelect: () => confirmThen(`Rebase ${current} onto ${name}?`, `The commits of ${current} are replayed on top of ${name}. If they were pushed, the next push needs a force push.`, 'Rebase', { type: 'rebase', onto: name }, false),
      },
      { separator: true },
      { label: 'New branch from it…', icon: 'plus', onSelect: () => openDialog({ kind: 'create-branch', from: gitRef.commit, fromLabel: name }) },
      { label: 'Rename…', icon: 'edit', onSelect: () => openDialog({ kind: 'rename-branch', name }) },
      ...(prUrl ? [{ label: 'Create pull request', icon: 'pr', hint: `into ${base}`, onSelect: () => window.open(prUrl, '_blank', 'noopener') } satisfies MenuItem] : []),
      {
        label: 'Delete…',
        icon: 'trash',
        danger: true,
        disabled: checkedOut || !!busy,
        title: checkedOut ? 'Switch to another branch first' : undefined,
        onSelect: () => openDialog({ kind: 'delete-branch', name, upstream: gitRef.upstream && !gitRef.gone ? gitRef.upstream : undefined }),
      },
    ]
  } else if (gitRef.type === 'remote') {
    if (name.endsWith('/HEAD')) return null
    items = [
      { label: 'Check out', icon: 'check', hint: 'as a local branch', disabled: !!busy, onSelect: () => void run({ type: 'checkout', ref: name, target: 'remote' }) },
      { label: `Merge into ${current}`, icon: 'merge', disabled: busyOrStuck, onSelect: () => void run({ type: 'merge', ref: name }) },
      { separator: true },
      {
        label: 'Delete on the remote…',
        icon: 'trash',
        danger: true,
        disabled: !!busy,
        onSelect: () => confirmThen(`Delete ${name}?`, `The branch is deleted on the remote, for everyone. Local branches keep their commits.`, 'Delete on the remote', { type: 'delete-remote-branch', name }),
      },
    ]
  } else {
    items = [
      { label: 'Check out', icon: 'commit', hint: 'detached', disabled: !!busy, onSelect: () => void run({ type: 'checkout', ref: gitRef.commit, target: 'commit' }) },
      { label: 'Push the tag', icon: 'push', disabled: !!busy || !live.remote, hint: live.remote, onSelect: () => void run({ type: 'push-tag', name }) },
      { separator: true },
      { label: 'Delete…', icon: 'trash', danger: true, disabled: !!busy, onSelect: () => confirmThen(`Delete tag ${name}?`, 'The tag is deleted in this repository (not on the remote).', 'Delete tag', { type: 'delete-tag', name }) },
    ]
  }
  return (
    <ActionMenu label={`Commands for ${name}`} items={items} className="dim-toggle ref-menu" testId={`ref-menu-${gitRef.type}:${name}`}>
      <Icon name="more" size={14} />
    </ActionMenu>
  )
}

function PrRow({ pr, model }: { pr: GitPullRequest; model: GitModel }) {
  const state = prState(pr)
  const target = pr.state === 'merged' ? (pr.mergeCommit ?? pr.headCommit) : pr.headCommit
  const inHistory = target !== undefined && model.rowOf.has(target)
  const url = pr.url ?? pullRequestUrl(model.history.repo.web, pr.number)
  const when = pr.state === 'merged' ? pr.mergedAt : pr.state === 'closed' ? pr.closedAt : pr.createdAt
  const open = () => {
    if (inHistory) useGit.getState().select(target!)
    else if (url) window.open(url, '_blank', 'noopener')
  }
  return (
    <li>
      <button
        type="button"
        className="pr-row"
        onClick={open}
        disabled={!inHistory && !url}
        title={inHistory ? 'Go to its commit' : url ? 'Not in the local history: open it on the hosting service' : 'Not in the local history'}
        data-testid={`pr-${pr.number}`}
      >
        <span className={`pr-state-icon ${state}`} aria-hidden="true">
          <Icon name="pr" size={14} />
        </span>
        <span className="sr-only">{PR_STATE_LABEL[state]}:</span>
        <span className="pr-main">
          <span className="pr-row-title">
            <span className="pr-number">#{pr.number}</span> {pr.title}
          </span>
          <span className="pr-row-meta">
            {pr.source && (
              <>
                {pr.source}
                {pr.target ? ` → ${pr.target}` : ''}
              </>
            )}
            {pr.author && <> · {pr.author}</>}
            {when && <> · {relativeTime(Date.parse(when) / 1000)}</>}
          </span>
        </span>
        {!inHistory && url && <Icon name="external" size={12} />}
      </button>
    </li>
  )
}

function SectionSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle section-switch" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  )
}
