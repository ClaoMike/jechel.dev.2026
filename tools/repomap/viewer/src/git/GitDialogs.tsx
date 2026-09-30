/** The History tab's forms and confirmations: new branch, rename, tag, reset, merge/rebase, delete, stash. */
import { useMemo, useState } from 'react'
import { refNameProblem, type GitAction, type ResetMode } from '../../../src/shared/git-actions.ts'
import { Dialog as SharedDialog, Field, type DialogProps } from '../ui/Dialog.tsx'
import { Icon } from '../ui/icons.tsx'
import { useGitActions, type GitDialog } from './actions.ts'
import { useGit } from './store.ts'

export function GitDialogs() {
  const dialog = useGitActions((s) => s.dialog)
  if (!dialog) return null
  // A new key per dialog: its fields start fresh.
  return <DialogBody key={JSON.stringify(dialog)} dialog={dialog} />
}

function DialogBody({ dialog }: { dialog: GitDialog }) {
  switch (dialog.kind) {
    case 'create-branch':
      return <CreateBranch from={dialog.from} fromLabel={dialog.fromLabel} />
    case 'rename-branch':
      return <RenameBranch name={dialog.name} />
    case 'create-tag':
      return <CreateTag commit={dialog.commit} label={dialog.label} />
    case 'reset':
      return <Reset commit={dialog.commit} label={dialog.label} initial={dialog.mode} />
    case 'pick-branch':
      return <PickBranch purpose={dialog.purpose} />
    case 'delete-branch':
      return <DeleteBranch name={dialog.name} upstream={dialog.upstream} />
    case 'stash':
      return <Stash />
    case 'confirm':
      return (
        <Dialog title={dialog.title} submitLabel={dialog.confirmLabel} danger={dialog.danger} onSubmit={() => run(dialog.action)}>
          <p className="dialog-text">{dialog.message}</p>
        </Dialog>
      )
  }
}

const run = (action: GitAction) => void useGitActions.getState().run(action)
const close = () => useGitActions.getState().closeDialog()

/** The git dialogs' shell: closing goes back to the History tab. */
function Dialog(props: Omit<DialogProps, 'onClose' | 'testId'>) {
  return <SharedDialog {...props} onClose={close} testId="git-dialog" />
}

function useBranchNames(): Set<string> {
  const history = useGit((s) => s.history)
  return useMemo(() => new Set(history?.refs.filter((r) => r.type === 'branch').map((r) => r.name) ?? []), [history])
}

function nameError(name: string, taken: Set<string>, what = 'branch'): string | null {
  if (!name) return null
  return refNameProblem(name) ?? (taken.has(name) ? `A ${what} named ${name} already exists.` : null)
}

function CreateBranch({ from, fromLabel }: { from?: string; fromLabel?: string }) {
  const live = useGitActions((s) => s.live)
  const taken = useBranchNames()
  const [name, setName] = useState('')
  const [checkout, setCheckout] = useState(true)
  const error = nameError(name, taken)
  return (
    <Dialog
      title="Create a branch"
      submitLabel={checkout ? 'Create and switch' : 'Create branch'}
      disabled={!name || !!error}
      onSubmit={() => run({ type: 'create-branch', name, checkout, ...(from ? { from } : {}) })}
    >
      <Field label="Name" error={error} hint="e.g. feature/login — letters, digits, / - _ .">
        <input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} spellCheck={false} autoComplete="off" data-testid="branch-name" />
      </Field>
      <p className="dialog-text muted">
        From <code>{fromLabel ?? live?.branch ?? live?.head?.slice(0, 7) ?? 'HEAD'}</code>
        {!from && live?.files.length ? ' — your uncommitted changes come along.' : '.'}
      </p>
      <label className="check-field">
        <input type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} /> Switch to it
      </label>
    </Dialog>
  )
}

function RenameBranch({ name: current }: { name: string }) {
  const taken = useBranchNames()
  const [name, setName] = useState(current)
  const error = name === current ? null : nameError(name, taken)
  return (
    <Dialog title={`Rename ${current}`} submitLabel="Rename" disabled={!name || name === current || !!error} onSubmit={() => run({ type: 'rename-branch', from: current, to: name })}>
      <Field label="New name" error={error} hint="The remote branch (if any) keeps its name.">
        <input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} spellCheck={false} autoComplete="off" data-testid="branch-name" />
      </Field>
    </Dialog>
  )
}

function CreateTag({ commit, label }: { commit: string; label: string }) {
  const history = useGit((s) => s.history)
  const taken = useMemo(() => new Set(history?.refs.filter((r) => r.type === 'tag').map((r) => r.name) ?? []), [history])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const error = nameError(name, taken, 'tag')
  return (
    <Dialog title="Create a tag" submitLabel="Create tag" disabled={!name || !!error} onSubmit={() => run({ type: 'create-tag', name, commit, ...(message.trim() ? { message } : {}) })}>
      <p className="dialog-text muted">
        On <code>{commit.slice(0, 7)}</code> {label}
      </p>
      <Field label="Name" error={error} hint="e.g. v1.2.0">
        <input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '-'))} spellCheck={false} autoComplete="off" data-testid="tag-name" />
      </Field>
      <Field label="Message (optional)" hint="With a message it is an annotated tag.">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      </Field>
    </Dialog>
  )
}

const RESET_MODES: { mode: ResetMode; label: string; hint: string }[] = [
  { mode: 'soft', label: 'Soft', hint: 'Keep the changes of the later commits, staged.' },
  { mode: 'mixed', label: 'Mixed', hint: 'Keep the changes of the later commits in your files (not staged).' },
  { mode: 'hard', label: 'Hard', hint: 'Discard the later commits and every uncommitted change.' },
]

function Reset({ commit, label, initial = 'mixed' }: { commit: string; label: string; initial?: ResetMode }) {
  const live = useGitActions((s) => s.live)
  const [mode, setMode] = useState<ResetMode>(initial)
  return (
    <Dialog
      title={`Reset ${live?.branch ?? 'HEAD'} to this commit?`}
      submitLabel={mode === 'hard' ? 'Reset and discard' : 'Reset'}
      danger={mode === 'hard'}
      onSubmit={() => run({ type: 'reset', commit, mode })}
    >
      <p className="dialog-text muted">
        <code>{commit.slice(0, 7)}</code> {label}
      </p>
      <fieldset className="radio-group">
        <legend className="field-label">Mode</legend>
        {RESET_MODES.map((option) => (
          <label key={option.mode} className={`radio-field${option.mode === 'hard' ? ' danger' : ''}`}>
            <input type="radio" name="reset-mode" value={option.mode} checked={mode === option.mode} onChange={() => setMode(option.mode)} />
            <span>
              <strong>{option.label}</strong> — {option.hint}
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  )
}

const PICK: Record<'merge' | 'squash' | 'rebase', { title: (current: string) => string; submit: string; hint: (current: string, other: string) => string }> = {
  merge: { title: (c) => `Merge into ${c}`, submit: 'Merge', hint: (c, o) => `Brings the commits of ${o} into ${c} with a merge commit.` },
  squash: { title: (c) => `Squash and merge into ${c}`, submit: 'Squash and merge', hint: (c, o) => `Adds everything ${o} changed to ${c} as one new commit.` },
  rebase: { title: (c) => `Rebase ${c}`, submit: 'Rebase', hint: (c, o) => `Replays the commits of ${c} on top of ${o}. Pushed commits then need a force push.` },
}

function PickBranch({ purpose }: { purpose: 'merge' | 'squash' | 'rebase' }) {
  const history = useGit((s) => s.history)
  const live = useGitActions((s) => s.live)
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const current = live?.branch ?? 'HEAD'
  const branches = useMemo(() => {
    const refs = history?.refs.filter((r) => (r.type === 'branch' || r.type === 'remote') && r.name !== live?.branch && !r.name.endsWith('/HEAD')) ?? []
    return refs.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'branch' ? -1 : 1))
  }, [history, live?.branch])
  const shown = branches.filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const text = PICK[purpose]
  return (
    <Dialog
      title={text.title(current)}
      submitLabel={picked ? `${text.submit} ${picked}` : text.submit}
      disabled={!picked}
      danger={purpose === 'rebase'}
      onSubmit={() => picked && run(purpose === 'rebase' ? { type: 'rebase', onto: picked } : { type: 'merge', ref: picked, squash: purpose === 'squash' })}
    >
      <Field label="Branch">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter branches" spellCheck={false} autoComplete="off" aria-label="Filter branches" />
      </Field>
      <div className="pick-list" role="listbox" aria-label="Branches" data-testid="pick-list">
        {shown.length === 0 && <p className="panel-empty">No other branches.</p>}
        {shown.map((ref) => (
          <button
            key={`${ref.type}:${ref.name}`}
            type="button"
            role="option"
            aria-selected={picked === ref.name}
            className={`pick-item${picked === ref.name ? ' selected' : ''}`}
            onClick={() => setPicked(ref.name)}
            onDoubleClick={() => {
              setPicked(ref.name)
              run(purpose === 'rebase' ? { type: 'rebase', onto: ref.name } : { type: 'merge', ref: ref.name, squash: purpose === 'squash' })
            }}
          >
            <Icon name="branch" size={13} /> {ref.name}
            {ref.type === 'remote' && <span className="mini-chip">remote</span>}
          </button>
        ))}
      </div>
      {picked && <p className="dialog-text muted">{text.hint(current, picked)}</p>}
    </Dialog>
  )
}

function DeleteBranch({ name, upstream }: { name: string; upstream?: string }) {
  const [remote, setRemote] = useState(false)
  const [force, setForce] = useState(false)
  return (
    <Dialog
      title={`Delete ${name}?`}
      submitLabel="Delete"
      danger
      onSubmit={() => {
        void (async () => {
          const actions = useGitActions.getState()
          const deleted = await actions.run({ type: 'delete-branch', name, force })
          if (deleted && remote && upstream) await actions.run({ type: 'delete-remote-branch', name: upstream })
        })()
      }}
    >
      <p className="dialog-text">The branch is removed from this repository. Its commits stay reachable from other branches that contain them.</p>
      <label className="check-field">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Delete even if it has commits that are not merged
      </label>
      {upstream && (
        <label className="check-field">
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} /> Also delete <code>{upstream}</code> on the remote
        </label>
      )}
    </Dialog>
  )
}

function Stash() {
  const live = useGitActions((s) => s.live)
  const [message, setMessage] = useState('')
  return (
    <Dialog title="Stash all changes" submitLabel="Stash" onSubmit={() => run({ type: 'stash', ...(message.trim() ? { message } : {}) })}>
      <p className="dialog-text muted">
        Puts away the {live?.files.length ?? 0} changed {live?.files.length === 1 ? 'file' : 'files'} (untracked ones included) and cleans the working tree. Restore them later from
        the ⋯ menu or the changes panel.
      </p>
      <Field label="Description (optional)">
        <input value={message} onChange={(e) => setMessage(e.target.value)} autoComplete="off" data-testid="stash-message" />
      </Field>
    </Dialog>
  )
}
