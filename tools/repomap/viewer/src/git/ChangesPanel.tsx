/**
 * The uncommitted changes, when `repomap serve` runs git commands: tick the files to commit (all by
 * default, like GitHub Desktop), write a summary, commit — or amend, discard, stash. Conflicted files
 * of a merge open in the code panel to be resolved.
 */
import { useEffect, useState } from 'react'
import type { LiveFile } from '../../../src/shared/git-actions.ts'
import { useViewer } from '../model/store.ts'
import { Icon } from '../ui/icons.tsx'
import { confirmThen, useGitActions } from './actions.ts'
import { relativeTime, type GitModel } from './model.ts'
import { worktreeStatus } from './parts.tsx'
import { useGit } from './store.ts'

/** A live file's two status letters in porcelain form ("M ", " M", "??", "UU"…). */
const porcelain = (file: LiveFile) => (file.x === '?' ? '??' : `${file.x === '.' ? ' ' : file.x}${file.y === '.' ? ' ' : file.y}`)

export function ChangesPanel({ model, fileNodes }: { model: GitModel; fileNodes: Map<string, number> }) {
  const live = useGitActions((s) => s.live)!
  const busy = useGitActions((s) => s.busy)
  const { run, openDialog } = useGitActions.getState()
  const { select } = useGit.getState()
  // Unticked files: new files start ticked.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const files = live.files
  const selected = files.filter((f) => !excluded.has(f.path))
  const headCommit = live.head ? model.byHash.get(live.head) : undefined
  const merging = live.operation === 'merge' || live.operation === 'rebase'
  const conflicts = files.filter((f) => f.conflicted)

  // Forget unticked files that are no longer changed.
  useEffect(() => {
    setExcluded((current) => {
      const paths = new Set(files.map((f) => f.path))
      const kept = new Set([...current].filter((p) => paths.has(p)))
      return kept.size === current.size ? current : kept
    })
  }, [files])

  const toggle = (path: string) =>
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  const allTicked = selected.length === files.length
  const someTicked = selected.length > 0 && !allTicked

  const toggleAmend = (on: boolean) => {
    setAmend(on)
    // Start from the message being amended.
    if (on && !summary.trim() && headCommit) {
      setSummary(headCommit.subject)
      setDescription(headCommit.body ?? '')
    }
  }

  // The last commit is on the remote already when the branch isn't ahead of it.
  const amendingPushed = amend && !!live.upstream && !live.upstreamGone && live.ahead === 0

  const commit = async () => {
    if (await run({ type: 'commit', summary, description, files: selected.map((f) => f.path), amend })) {
      setSummary('')
      setDescription('')
      setAmend(false)
      const head = useGitActions.getState().live?.head
      if (head && useGit.getState().model?.rowOf.has(head)) select(head)
    }
  }

  const branch = live.branch
  const canCommit = !busy && !merging && summary.trim().length > 0 && (selected.length > 0 || amend)
  const commitLabel = amend ? 'Amend last commit' : `Commit ${selected.length} ${selected.length === 1 ? 'file' : 'files'}${branch ? ` to ${branch}` : ''}`

  return (
    <>
      <header className="details-header">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="commit-glyph">
          <circle cx="10" cy="10" r="6" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeDasharray="2.5 2.5" />
        </svg>
        <div className="details-title">
          <h2>Uncommitted changes</h2>
          <div className="chips">
            {branch ? <span className="chip solid" style={{ ['--chip-color' as string]: 'var(--accent)' }}>on {branch}</span> : <span className="chip">detached HEAD</span>}
          </div>
        </div>
        <button type="button" className="icon-button" onClick={() => select(null)} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>
      <div className="details-scroll">
        {merging && conflicts.length > 0 && (
          <p className="why">Open each conflicted file, keep what should stay and remove the conflict markers, then choose “{live.operation === 'merge' ? 'Commit merge' : 'Continue'}” above.</p>
        )}
        <section className="detail-section">
          <h3 className="changes-heading">
            {files.length > 0 && (
              <input
                type="checkbox"
                className="file-check"
                checked={allTicked}
                ref={(input) => {
                  if (input) input.indeterminate = someTicked
                }}
                onChange={() => setExcluded(allTicked ? new Set(files.map((f) => f.path)) : new Set())}
                aria-label={allTicked ? 'Untick all files' : 'Tick all files'}
                disabled={merging}
              />
            )}
            <Icon name="file" size={14} /> {files.length} changed {files.length === 1 ? 'file' : 'files'}
            <span className="changes-tools">
              <button
                type="button"
                className="link-button"
                disabled={!!busy || selected.length === 0}
                onClick={() =>
                  confirmThen(
                    `Discard changes to ${selected.length} ${selected.length === 1 ? 'file' : 'files'}?`,
                    'The ticked files go back to how they are in the last commit; new files are deleted. This cannot be undone.',
                    'Discard changes',
                    { type: 'discard', files: selected.map((f) => f.path) },
                  )
                }
                data-testid="discard-selected"
              >
                <Icon name="trash" size={13} /> Discard
              </button>
              <button type="button" className="link-button" disabled={!!busy || files.length === 0} onClick={() => openDialog({ kind: 'stash' })}>
                <Icon name="stash" size={13} /> Stash
              </button>
            </span>
          </h3>
          {files.length === 0 ? (
            <p className="muted">No local changes.</p>
          ) : (
            <ul className="plain file-list" data-testid="change-list">
              {files.map((file) => (
                <ChangeRow key={file.path} file={file} ticked={!excluded.has(file.path)} onToggle={() => toggle(file.path)} node={fileNodes.get(file.path)} locked={merging} />
              ))}
            </ul>
          )}
        </section>
        {live.stashes.length > 0 && (
          <section className="detail-section">
            <h3>
              <Icon name="stash" size={14} /> Stashes <span className="trace-counts">{live.stashes.length}</span>
            </h3>
            <ul className="plain stash-list" data-testid="stash-list">
              {live.stashes.map((stash) => (
                <li key={stash.index} className="stash-row">
                  <span className="stash-text">
                    <span>{stash.message}</span>
                    {stash.date > 0 && <span className="muted"> · {relativeTime(stash.date)}</span>}
                  </span>
                  <button type="button" className="link-button" disabled={!!busy} onClick={() => void run({ type: 'stash-pop', index: stash.index })} title="Apply it and drop it">
                    Restore
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    disabled={!!busy}
                    onClick={() => confirmThen('Drop this stash?', `“${stash.message}” is deleted for good.`, 'Drop stash', { type: 'stash-drop', index: stash.index })}
                  >
                    Drop
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <form
        className="commit-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (canCommit) void commit()
        }}
        data-testid="commit-form"
      >
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={merging ? 'Finish the merge from the banner above' : 'Summary (required)'}
          aria-label="Commit summary"
          disabled={merging}
          maxLength={500}
          data-testid="commit-summary"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCommit) void commit()
          }}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          aria-label="Commit description"
          rows={3}
          disabled={merging}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canCommit) void commit()
          }}
        />
        {amendingPushed && <p className="field-error">The last commit is already pushed: after amending, pushing needs a force push.</p>}
        <div className="commit-form-row">
          <label className="check-field" title={headCommit ? `Change “${headCommit.subject}” instead of making a new commit` : undefined}>
            <input type="checkbox" checked={amend} onChange={(e) => toggleAmend(e.target.checked)} disabled={!live.head || merging} /> Amend last commit
          </label>
          <button type="submit" className="button primary" disabled={!canCommit} data-testid="commit-button">
            {commitLabel}
          </button>
        </div>
      </form>
    </>
  )
}

function ChangeRow({ file, ticked, onToggle, node, locked }: { file: LiveFile; ticked: boolean; onToggle(): void; node?: number; locked: boolean }) {
  const status = worktreeStatus(porcelain(file))
  const current = useGit((s) => s.path === file.path)
  const busy = useGitActions((s) => s.busy)
  const slash = file.path.lastIndexOf('/')
  const deleted = file.x === 'D' || file.y === 'D'
  const edit = () => {
    if (node !== undefined) useViewer.getState().openCode(node)
  }
  return (
    <li className={`file-row change-row${file.conflicted ? ' conflicted' : ''}`}>
      <input type="checkbox" className="file-check" checked={ticked} onChange={onToggle} disabled={locked} aria-label={`Include ${file.path} in the commit`} />
      <span className={`file-status ${status.className}`} title={status.label}>
        {status.letter}
      </span>
      <span className="file-path" title={file.from ? `${file.from} → ${file.path}` : file.path}>
        {file.from && <span className="file-from">{file.from.split('/').pop()} → </span>}
        <span className="file-dir">{slash >= 0 ? file.path.slice(0, slash + 1) : ''}</span>
        <span className="file-name">{slash >= 0 ? file.path.slice(slash + 1) : file.path}</span>
      </span>
      <span className="file-actions">
        {node !== undefined && !deleted && (
          <button type="button" className="mini-button" onClick={edit} title={file.conflicted ? 'Resolve the conflict in the editor' : 'Edit the file'} aria-label={`Edit ${file.path}`}>
            <Icon name="edit" size={13} />
          </button>
        )}
        <button
          type="button"
          className={`mini-button${current ? ' active' : ''}`}
          onClick={() => useGit.getState().setPath(current ? null : file.path)}
          title={current ? 'Stop following this file' : 'Commits that changed this file'}
          aria-label={`History of ${file.path}`}
        >
          <Icon name="clock" size={13} />
        </button>
        <button
          type="button"
          className="mini-button"
          disabled={!!busy || locked}
          onClick={() =>
            confirmThen(
              `Discard changes to ${file.path.split('/').pop()}?`,
              file.x === '?' || file.x === 'A' ? 'The file is new: it will be deleted. This cannot be undone.' : 'It goes back to how it is in the last commit. This cannot be undone.',
              'Discard changes',
              { type: 'discard', files: [file.path] },
            )
          }
          title="Discard the changes to this file"
          aria-label={`Discard ${file.path}`}
        >
          <Icon name="trash" size={13} />
        </button>
      </span>
    </li>
  )
}
