/** The selected commit (or the uncommitted changes): message, people, relations, pull request, files. */
import { useMemo, useState, type ReactNode } from 'react'
import { isCommitHash } from '../../../src/shared/git-actions.ts'
import { commitUrl, pullRequestUrl, WORKTREE, type GitCommit, type GitFileChange, type GitPullRequest, type GitRef } from '../../../src/shared/git-types.ts'
import type { GraphIndex } from '../model/graph.ts'
import { useViewer } from '../model/store.ts'
import { Icon } from '../ui/icons.tsx'
import { confirmThen, useGitActions } from './actions.ts'
import { ChangesPanel } from './ChangesPanel.tsx'
import { containingRefs, fullDate, mergedBranch, mergeTarget, refBadges, relativeTime, shortHash, type GitModel } from './model.ts'
import { Avatar, FILE_STATUS, laneColor, PR_STATE_LABEL, PrBadge, prState, RefBadgeView, worktreeStatus } from './parts.tsx'
import { useGit } from './store.ts'

const FILES_SHOWN = 200

export function CommitDetails({ model }: { model: GitModel }) {
  const selected = useGit((s) => s.selected)
  const expanded = useGit((s) => s.sheetExpanded)
  const index = useViewer((s) => s.index)
  const fileNodes = useMemo(() => filesInMap(index), [index])
  const live = useGitActions((s) => (s.available ? s.live : null))
  if (!selected) return null
  const commit = selected === WORKTREE ? null : model.byHash.get(selected)
  if (selected !== WORKTREE && !commit) return null
  return (
    <aside className={`details git-details${expanded ? ' expanded' : ''}`} data-testid="commit-details" aria-label="Commit details">
      <button
        type="button"
        className="sheet-handle narrow-only"
        onClick={() => useGit.getState().setSheetExpanded(!expanded)}
        aria-label={expanded ? 'Collapse details' : 'Expand details'}
        aria-expanded={expanded}
      >
        <span />
      </button>
      {commit ? (
        <CommitBody model={model} commit={commit} fileNodes={fileNodes} />
      ) : live ? (
        <ChangesPanel model={model} fileNodes={fileNodes} />
      ) : (
        <WorktreeBody model={model} fileNodes={fileNodes} />
      )}
    </aside>
  )
}

function CommitBody({ model, commit, fileNodes }: { model: GitModel; commit: GitCommit; fileNodes: Map<string, number> }) {
  const theme = useViewer((s) => s.theme)
  const row = model.rowOf.get(commit.hash)
  const color = laneColor(row !== undefined ? model.lanes.color[row] : 0, theme)
  const history = model.history
  const head = history.repo.head
  const badges = refBadges(model.refsAt.get(commit.hash) ?? [], history.repo.remotes.map((r) => r.name), head?.branch)
  const prs = model.prsAt.get(commit.hash) ?? []
  const merged = commit.pr !== undefined ? model.prByNumber.get(commit.pr) : undefined
  const containing = useMemo(() => containingRefs(model, commit.hash), [model, commit.hash])
  const children = model.children.get(commit.hash) ?? []
  const link = commitUrl(history.repo.web, commit.hash)
  const mergeSource = commit.parents.length > 1 ? (merged?.source ?? mergedBranch(commit.subject)) : undefined
  const mergeInto = commit.parents.length > 1 ? (merged?.target ?? mergeTarget(commit.subject)) : undefined
  const { select } = useGit.getState()

  return (
    <>
      <header className="details-header">
        <CommitGlyph color={color} merge={commit.parents.length > 1} head={head?.commit === commit.hash} />
        <div className="details-title">
          <h2>{commit.subject}</h2>
          {(badges.length > 0 || prs.length > 0) && (
            <div className="chips">
              {badges.map((badge) => (
                <RefBadgeView key={`${badge.type}:${badge.label}`} badge={badge} color={color} />
              ))}
              {prs.map((pr) => (
                <PrBadge key={pr.number} pr={pr} />
              ))}
            </div>
          )}
        </div>
        <button type="button" className="icon-button" onClick={() => select(null)} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>

      <div className="details-scroll">
        {commit.body && <p className="commit-body">{commit.body}</p>}

        <dl className="attrs">
          <Attr label="Commit">
            <span className="hash-line">
              <code title={commit.hash}>{commit.hash.slice(0, 12)}</code>
              <CopyButton text={commit.hash} label="Copy the full hash" />
              {link && (
                <a className="link-button" href={link} target="_blank" rel="noreferrer" title="Open on the hosting service">
                  <Icon name="external" size={13} /> Open
                </a>
              )}
            </span>
          </Attr>
          <Attr label="Author">
            <span className="person">
              <Avatar name={commit.author} />
              {commit.author}
            </span>
            <span className="muted" title={fullDate(commit.date)}>
              {' '}
              · {relativeTime(commit.date)}
            </span>
          </Attr>
          <Attr label="Date">{fullDate(commit.date)}</Attr>
          {(commit.committer || commit.committedAt) && (
            <Attr label="Committed">
              {commit.committer ?? commit.author}
              {commit.committedAt && <span className="muted"> · {fullDate(commit.committedAt)}</span>}
            </Attr>
          )}
          {commit.coAuthors && <Attr label="Co-authors">{commit.coAuthors.join(', ')}</Attr>}
          {mergeSource && (
            <Attr label="Merged">
              <code>{mergeSource}</code>
              {mergeInto && (
                <>
                  {' → '}
                  <code>{mergeInto}</code>
                </>
              )}
            </Attr>
          )}
          <Attr label={commit.parents.length === 1 ? 'Parent' : 'Parents'}>
            {commit.parents.length === 0 ? <span className="muted">none (first commit)</span> : <CommitLinks model={model} hashes={commit.parents} />}
          </Attr>
          {children.length > 0 && (
            <Attr label={children.length === 1 ? 'Child' : 'Children'}>
              <CommitLinks model={model} hashes={children} />
            </Attr>
          )}
        </dl>

        {(merged || prs.some((pr) => pr !== merged)) && (
          <section className="detail-section">
            <h3>
              <Icon name="pr" size={14} /> Pull request
            </h3>
            {[...new Set([merged, ...prs].filter((pr): pr is GitPullRequest => !!pr))].map((pr) => (
              <PullRequestCard key={pr.number} pr={pr} model={model} commit={commit} />
            ))}
          </section>
        )}

        {containing.length > 0 && (
          <section className="detail-section">
            <h3>
              <Icon name="branch" size={14} /> In {containing.length} {containing.length === 1 ? 'ref' : 'refs'}
            </h3>
            <RefChips refs={containing} model={model} />
          </section>
        )}

        <CommitActions model={model} commit={commit} />

        <FileList
          files={commit.files ?? []}
          omitted={commit.filesOmitted}
          stats={commit.stats}
          fileNodes={fileNodes}
          caption={commit.parents.length > 1 ? 'Changes brought in (against the first parent)' : undefined}
        />
      </div>
    </>
  )
}

function WorktreeBody({ model, fileNodes }: { model: GitModel; fileNodes: Map<string, number> }) {
  const tree = model.history.workingTree
  const head = model.history.repo.head
  const { select } = useGit.getState()
  if (!tree) return null
  return (
    <>
      <header className="details-header">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="commit-glyph">
          <circle cx="10" cy="10" r="6" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeDasharray="2.5 2.5" />
        </svg>
        <div className="details-title">
          <h2>Uncommitted changes</h2>
          <div className="chips">
            {head?.branch ? <span className="chip solid" style={{ ['--chip-color' as string]: 'var(--accent)' }}>on {head.branch}</span> : <span className="chip">detached HEAD</span>}
          </div>
        </div>
        <button type="button" className="icon-button" onClick={() => select(null)} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>
      <div className="details-scroll">
        <p className="description muted">Your working copy, as it was when the history was read. The map tab reflects these files too.</p>
        <dl className="attrs">
          {head && (
            <Attr label="Based on">
              <CommitLinks model={model} hashes={[head.commit]} />
            </Attr>
          )}
          <Attr label="Changes">
            {[
              tree.staged && `${tree.staged} staged`,
              tree.unstaged && `${tree.unstaged} modified`,
              tree.untracked && `${tree.untracked} untracked`,
              tree.conflicted && `${tree.conflicted} with conflicts`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Attr>
        </dl>
        <section className="detail-section">
          <h3>
            <Icon name="file" size={14} /> Files <span className="trace-counts">{tree.files.length}</span>
          </h3>
          <ul className="plain file-list">
            {tree.files.map((file) => {
              const status = worktreeStatus(file.status)
              return <FileRow key={file.path} path={file.path} letter={status.letter} label={status.label} className={status.className} node={fileNodes.get(file.path)} />
            })}
          </ul>
        </section>
      </div>
    </>
  )
}

function PullRequestCard({ pr, model, commit }: { pr: GitPullRequest; model: GitModel; commit: GitCommit }) {
  const url = pr.url ?? pullRequestUrl(model.history.repo.web, pr.number)
  const state = prState(pr)
  const role = pr.mergeCommit === commit.hash ? (pr.origin === 'squash-message' ? 'Squashed into this commit' : 'Merged by this commit') : pr.headCommit === commit.hash ? 'Its newest commit' : undefined
  const when = pr.state === 'merged' ? pr.mergedAt : pr.state === 'closed' ? pr.closedAt : pr.createdAt
  return (
    <div className={`pr-card ${state}`}>
      <div className="pr-card-title">
        <span className={`pr-state ${state}`}>{PR_STATE_LABEL[state]}</span>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            #{pr.number} {pr.title}
          </a>
        ) : (
          <span>
            #{pr.number} {pr.title}
          </span>
        )}
      </div>
      <div className="pr-card-meta">
        {(pr.source || pr.target) && (
          <span>
            <code>{pr.source ?? '?'}</code> → <code>{pr.target ?? '?'}</code>
          </span>
        )}
        {pr.author && <span>by {pr.author}</span>}
        {when && <span title={new Date(when).toLocaleString()}>{relativeTime(Date.parse(when) / 1000)}</span>}
      </div>
      {role && <div className="pr-card-role">{role}</div>}
    </div>
  )
}

function FileList({
  files,
  omitted,
  stats,
  fileNodes,
  caption,
}: {
  files: GitFileChange[]
  omitted?: number
  stats?: GitCommit['stats']
  fileNodes: Map<string, number>
  caption?: string
}) {
  const [all, setAll] = useState(false)
  const shown = all ? files : files.slice(0, FILES_SHOWN)
  return (
    <section className="detail-section">
      <h3>
        <Icon name="file" size={14} /> Files
        <span className="trace-counts">{stats?.files ?? files.length}</span>
        {stats && (
          <span className="delta">
            <span className="adds">+{stats.additions}</span> <span className="dels">−{stats.deletions}</span>
          </span>
        )}
      </h3>
      {caption && <p className="why">{caption}</p>}
      {files.length === 0 ? (
        <p className="muted">No file changes.</p>
      ) : (
        <ul className="plain file-list" data-testid="commit-files">
          {shown.map((file) => {
            const status = FILE_STATUS[file.status] ?? FILE_STATUS.M
            return (
              <FileRow
                key={`${file.from ?? ''}>${file.path}`}
                path={file.path}
                from={file.from}
                letter={file.status}
                label={status.label}
                className={status.className}
                additions={file.additions}
                deletions={file.deletions}
                node={fileNodes.get(file.path)}
              />
            )
          })}
        </ul>
      )}
      {!all && files.length > FILES_SHOWN && (
        <button type="button" className="link-button" onClick={() => setAll(true)}>
          Show all {files.length} files
        </button>
      )}
      {omitted ? <p className="muted">…and {omitted} more files not recorded in git.json.</p> : null}
    </section>
  )
}

function FileRow(props: { path: string; from?: string; letter: string; label: string; className: string; additions?: number; deletions?: number; node?: number }) {
  const { path, from, letter, label, className, additions, deletions, node } = props
  const current = useGit((s) => s.path === path)
  const slash = path.lastIndexOf('/')
  const showInMap = () => {
    if (node === undefined) return
    const viewer = useViewer.getState()
    viewer.setTab('map')
    viewer.select(node, true)
  }
  return (
    <li className={`file-row${current ? ' current' : ''}`}>
      <span className={`file-status ${className}`} title={label}>
        {letter}
      </span>
      <span className="file-path" title={from ? `${from} → ${path}` : path}>
        {from && <span className="file-from">{from.split('/').pop()} → </span>}
        <span className="file-dir">{slash >= 0 ? path.slice(0, slash + 1) : ''}</span>
        <span className="file-name">{slash >= 0 ? path.slice(slash + 1) : path}</span>
      </span>
      {additions !== undefined && (
        <span className="delta">
          {additions > 0 && <span className="adds">+{additions}</span>}
          {deletions ? <span className="dels">−{deletions}</span> : null}
        </span>
      )}
      <span className="file-actions">
        {node !== undefined && (
          <button type="button" className="mini-button" onClick={showInMap} title="Show it in the architecture map" aria-label={`Show ${path} in the map`}>
            <Icon name="layers" size={13} />
          </button>
        )}
        <button
          type="button"
          className={`mini-button${current ? ' active' : ''}`}
          onClick={() => useGit.getState().setPath(current ? null : path)}
          title={current ? 'Stop following this file' : 'Commits that changed this file'}
          aria-label={`History of ${path}`}
        >
          <Icon name="clock" size={13} />
        </button>
      </span>
    </li>
  )
}

function RefChips({ refs, model }: { refs: GitRef[]; model: GitModel }) {
  const [all, setAll] = useState(false)
  const order = { branch: 0, remote: 1, tag: 2 }
  const sorted = [...refs].sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name))
  const shown = all ? sorted : sorted.slice(0, 10)
  return (
    <div className="chips ref-chips">
      {shown.map((ref) => (
        <button
          key={`${ref.type}:${ref.name}`}
          type="button"
          className={`chip ref-chip ${ref.type}`}
          onClick={() => jumpToRef(ref, model)}
          title={`${ref.type === 'tag' ? 'Tag' : ref.type === 'remote' ? 'Remote branch' : 'Branch'} ${ref.name}: go to its commit`}
        >
          <Icon name={ref.type === 'tag' ? 'tag' : 'branch'} size={12} /> {ref.name}
        </button>
      ))}
      {!all && sorted.length > shown.length && (
        <button type="button" className="chip" onClick={() => setAll(true)}>
          +{sorted.length - shown.length} more
        </button>
      )}
    </div>
  )
}

/** Selects a ref's commit, showing the ref first if the branch filters hid it. */
export function jumpToRef(ref: GitRef, model: GitModel): void {
  const git = useGit.getState()
  if (!model.rowOf.has(ref.commit)) {
    if (ref.type === 'remote' && !git.filters.remotes) git.setFilters({ remotes: true })
    if (ref.type === 'tag' && !git.filters.tags) git.setFilters({ tags: true })
    const key = `${ref.type}:${ref.name}`
    if (useGit.getState().filters.hiddenRefs.includes(key)) git.toggleRef(key)
  }
  git.select(ref.commit)
}

function CommitLinks({ model, hashes }: { model: GitModel; hashes: string[] }) {
  return (
    <span className="commit-links">
      {hashes.map((hash) => {
        const commit = model.byHash.get(hash)
        return (
          <button
            key={hash}
            type="button"
            className="commit-link"
            onClick={() => useGit.getState().select(hash)}
            disabled={!model.rowOf.has(hash)}
            title={commit ? `${commit.subject}\n${commit.author}, ${fullDate(commit.date)}` : 'Not in the loaded history'}
          >
            <code>{shortHash(hash)}</code>
            {commit && <span className="commit-link-subject">{commit.subject}</span>}
          </button>
        )
      })}
    </span>
  )
}

function CommitGlyph({ color, merge, head }: { color: string; merge: boolean; head: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="commit-glyph">
      {head && <circle cx="10" cy="10" r="8.3" fill="none" stroke={color} strokeWidth="1.5" />}
      {merge ? <circle cx="10" cy="10" r="4" fill="var(--panel-solid)" stroke={color} strokeWidth="2" /> : <circle cx="10" cy="10" r="5" fill={color} />}
    </svg>
  )
}

function Attr({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="attr">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        })
      }}
      title={label}
    >
      <Icon name="copy" size={13} /> {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** What can be done with a commit, when `repomap serve` runs git commands. */
function CommitActions({ model, commit }: { model: GitModel; commit: GitCommit }) {
  const available = useGitActions((s) => s.available)
  const live = useGitActions((s) => s.live)
  const busy = useGitActions((s) => s.busy)
  const head = live?.head
  // Commits the checked-out branch already has: cherry-pick makes no sense for them, revert does.
  const inHead = useMemo(() => {
    const reached = new Set<string>()
    const stack = head ? [head] : []
    while (stack.length > 0) {
      const hash = stack.pop()!
      if (reached.has(hash)) continue
      reached.add(hash)
      for (const parent of model.byHash.get(hash)?.parents ?? []) stack.push(parent)
    }
    return reached
  }, [model, head])
  if (!available || !live || !isCommitHash(commit.hash)) return null
  const { run, openDialog } = useGitActions.getState()
  const short = commit.hash.slice(0, 7)
  const current = live.branch ?? 'HEAD'
  const isHead = commit.hash === head
  const contained = inHead.has(commit.hash)
  const operation = !!live.operation
  const disabled = !!busy
  return (
    <section className="detail-section" data-testid="commit-actions">
      <h3>
        <Icon name="git" size={14} /> Actions
      </h3>
      <div className="chips action-chips">
        <button type="button" className="chip" disabled={disabled} onClick={() => openDialog({ kind: 'create-branch', from: commit.hash, fromLabel: `${short} ${commit.subject}` })}>
          <Icon name="branch" size={13} /> New branch here…
        </button>
        <button type="button" className="chip" disabled={disabled} onClick={() => openDialog({ kind: 'create-tag', commit: commit.hash, label: commit.subject })}>
          <Icon name="tag" size={13} /> Tag…
        </button>
        {!isHead && (
          <button
            type="button"
            className="chip"
            disabled={disabled}
            onClick={() => void run({ type: 'checkout', ref: commit.hash, target: 'commit' })}
            title="Check out this commit without a branch (detached HEAD)"
          >
            <Icon name="commit" size={13} /> Check out
          </button>
        )}
        {!contained && (
          <button type="button" className="chip" disabled={disabled || operation || !head} onClick={() => void run({ type: 'cherry-pick', commit: commit.hash })} title={`Apply this commit's changes on ${current}`}>
            <Icon name="merge" size={13} /> Cherry-pick onto {current}
          </button>
        )}
        {contained && (
          <button
            type="button"
            className="chip"
            disabled={disabled || operation}
            onClick={() => confirmThen(`Revert ${short}?`, `A new commit on ${current} undoes the changes of “${commit.subject}”.`, 'Revert', { type: 'revert', commit: commit.hash }, false)}
          >
            <Icon name="reset" size={13} /> Revert
          </button>
        )}
        {isHead && commit.parents.length > 0 && (
          <button
            type="button"
            className="chip"
            disabled={disabled || operation}
            onClick={() =>
              live.upstream && live.ahead === 0
                ? confirmThen('Undo a pushed commit?', `“${commit.subject}” is already on ${live.upstream}. Undoing it here means the next push needs a force push.`, 'Undo commit', { type: 'undo-commit' })
                : void run({ type: 'undo-commit' })
            }
            title="Take this commit back: its changes return to your working tree"
          >
            <Icon name="reset" size={13} /> Undo commit
          </button>
        )}
        {contained && !isHead && (
          <button type="button" className="chip" disabled={disabled || operation} onClick={() => openDialog({ kind: 'reset', commit: commit.hash, label: commit.subject })}>
            <Icon name="reset" size={13} /> Reset {current} to here…
          </button>
        )}
      </div>
    </section>
  )
}

/** Repo path → a map node for it (the file node when there is one). */
function filesInMap(index: GraphIndex | null): Map<string, number> {
  const files = new Map<string, number>()
  if (!index) return files
  index.nodes.forEach((node, i) => {
    if (!node.file) return
    if (node.id.includes(':file:') || !files.has(node.file)) files.set(node.file, i)
  })
  return files
}
