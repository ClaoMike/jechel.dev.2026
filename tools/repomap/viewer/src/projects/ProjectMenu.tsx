/**
 * The Projects menu (the project's name in the top bar): the projects repomap knows, opening another repository, and
 * creating a new one from the standard skeleton (React in Feature-Sliced Design, ASP.NET Core in vertical slices,
 * PostgreSQL, all in Docker, with the lint rules and architecture tests that keep that structure).
 */
import { useEffect, useState } from 'react'
import { ActionMenu, type MenuItem } from '../ui/ActionMenu.tsx'
import { Dialog, Field } from '../ui/Dialog.tsx'
import { Icon } from '../ui/icons.tsx'
import { useProjects } from './store.ts'

export function ProjectMenu({ name }: { name: string }) {
  const available = useProjects((s) => s.available)
  const view = useProjects((s) => s.view)
  if (!available || !view) return <strong>{name}</strong>
  const { open, setDialog } = useProjects.getState()
  const items: MenuItem[] = [
    { heading: 'Projects' },
    ...view.projects.map((p) => ({
      label: p.name,
      icon: p.current ? ('check' as const) : ('folder' as const),
      hint: p.root,
      title: p.missing ? `${p.root} is gone` : p.root,
      disabled: p.current || p.missing,
      onSelect: () => void open(p.id),
    })),
    { separator: true },
    { label: 'Open a repository…', icon: 'open', onSelect: () => setDialog('open') },
    { label: 'New project…', icon: 'plus', onSelect: () => setDialog('create') },
  ]
  return (
    <ActionMenu label="Projects" items={items} className="project-button" testId="project-menu" title="Projects: open another, or create one">
      <strong>{name}</strong>
      <Icon name="caret" size={12} />
    </ActionMenu>
  )
}

/** The menu's dialogs, and the screen shown while switching. */
export function ProjectOverlays() {
  const dialog = useProjects((s) => s.dialog)
  const switching = useProjects((s) => s.switching)
  useEffect(() => {
    void useProjects.getState().init()
  }, [])
  return (
    <>
      {dialog === 'open' && <OpenDialog />}
      {dialog === 'create' && <CreateDialog />}
      {switching && switching.state !== 'failed' && (
        <div className="modal-backdrop switching" role="status" aria-live="polite" data-testid="project-switching">
          <div className="modal switching-card">
            <div className="spinner" aria-hidden="true" />
            <p>
              Opening <strong>{switching.name}</strong>
              {switching.state === 'building' ? ': building its map…' : '…'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function OpenDialog() {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const close = () => useProjects.getState().setDialog(null)
  const submit = async () => {
    setBusy(true)
    const problem = await useProjects.getState().add(path.trim(), name.trim())
    setBusy(false)
    if (problem) setError(problem)
    else close()
  }
  return (
    <Dialog
      title="Open a repository"
      submitLabel={busy ? 'Opening…' : 'Open'}
      disabled={busy || !path.trim()}
      onSubmit={() => void submit()}
      onClose={close}
      testId="project-open-dialog"
    >
      <Field label="Folder" hint="The repository's folder on this machine (a git repository)." error={error}>
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/Users/you/code/my-site" spellCheck={false} data-testid="project-path" />
      </Field>
      <Field label="Name" hint="Optional: the folder's name otherwise.">
        <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      </Field>
    </Dialog>
  )
}

/** "My Shop" → my-shop: the folder the project goes in (the server says if the name won't do). */
function slugOf(name: string): string {
  return name
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => w.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .map((w) => w.toLowerCase())
    .join('-')
}

function CreateDialog() {
  const defaultParent = useProjects((s) => s.view?.defaultParent ?? '')
  const [name, setName] = useState('')
  const [parent, setParent] = useState(defaultParent)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const close = () => useProjects.getState().setDialog(null)
  const slug = slugOf(name)
  const submit = async () => {
    setBusy(true)
    const problem = await useProjects.getState().create(name.trim(), parent.trim())
    setBusy(false)
    if (problem) setError(problem)
    else close()
  }
  return (
    <Dialog
      title="New project"
      submitLabel={busy ? 'Creating…' : 'Create'}
      disabled={busy || !slug || !parent.trim()}
      onSubmit={() => void submit()}
      onClose={close}
      testId="project-create-dialog"
    >
      <Field label="Name" error={error}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Shop" spellCheck={false} data-testid="project-name" />
      </Field>
      <Field label="In the folder" hint={slug ? `It goes in ${parent.replace(/\/+$/, '')}/${slug}` : 'Where the project’s folder goes.'}>
        <input value={parent} onChange={(e) => setParent(e.target.value)} spellCheck={false} data-testid="project-parent" />
      </Field>
      <div className="dialog-text project-includes">
        <p>The standard structure, ready to run with Docker:</p>
        <ul>
          <li>
            <strong>Frontend</strong>: React + TypeScript (Vite) in Feature-Sliced Design, checked by <code>npm run lint</code> (oxlint and Steiger)
          </li>
          <li>
            <strong>Backend</strong>: ASP.NET Core in vertical slices (one class per endpoint), EF Core migrations, and architecture tests
          </li>
          <li>
            <strong>Database</strong>: PostgreSQL, with the frontend and backend in one <code>docker-compose.yml</code>
          </li>
        </ul>
        <p className="muted">A new git repository, its files staged (the first commit is yours). Start runs it.</p>
      </div>
    </Dialog>
  )
}
