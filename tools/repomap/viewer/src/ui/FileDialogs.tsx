/** New file, rename or move, delete — for a file or a folder, from the explorer or the details panel. */
import { useEffect, useMemo, useState } from 'react'
import { placementOf, useFiles, type FileDialog, type Placement } from '../model/files.ts'
import { useViewer } from '../model/store.ts'
import { templateFor } from '../model/templates.ts'
import { Dialog, Field } from './Dialog.tsx'

export function FileDialogs() {
  const dialog = useFiles((s) => s.dialog)
  if (!dialog) return null
  return <Body key={JSON.stringify(dialog)} dialog={dialog} />
}

function Body({ dialog }: { dialog: FileDialog }) {
  switch (dialog.kind) {
    case 'create':
      return <CreateFile folder={dialog.folder} />
    case 'rename':
      return <RenamePath path={dialog.path} folder={dialog.folder} />
    case 'delete':
      return <DeletePath path={dialog.path} folder={dialog.folder} count={dialog.count} />
  }
}

const close = () => useFiles.getState().closeDialog()

/** Every file the dialogs know of: git's list on a writable server, else the map's. */
function useKnownFiles(): string[] {
  const files = useFiles((s) => s.files)
  const index = useViewer((s) => s.index)
  return useMemo(() => files ?? [...new Set(index?.nodes.map((n) => n.file).filter((f): f is string => !!f) ?? [])], [files, index])
}

/** Why a path can't be used, or null. */
export function pathProblem(path: string, known: Set<string>, folders: Set<string>): string | null {
  const clean = path.trim()
  if (!clean || clean.endsWith('/')) return 'Type a file name.'
  if (clean.startsWith('/') || clean.split('/').includes('..')) return 'The path is relative to the repository, without "..".'
  if (clean.split('/').some((part) => part.toLowerCase() === '.git')) return 'Files inside .git cannot be changed.'
  if (clean.split('/').some((part) => part === '' || part === '.')) return 'No empty parts between slashes.'
  if (/[\0<>:"|?*]/.test(clean)) return 'No < > : " | ? * characters.'
  if (known.has(clean)) return `${clean} already exists.`
  if (folders.has(clean)) return `${clean} is a folder.`
  return null
}

function foldersOf(files: readonly string[]): Set<string> {
  const folders = new Set<string>()
  for (const file of files) {
    const parts = file.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }
  return folders
}

/** The layer and role a path would get, as it is typed. */
function usePlacement(path: string, enabled: boolean): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null)
  useEffect(() => {
    if (!enabled) {
      setPlacement(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => void placementOf(path, controller.signal).then((p) => !controller.signal.aborted && setPlacement(p)), 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [path, enabled])
  return placement
}

function PlacementNote({ placement }: { placement: Placement | null }) {
  const index = useViewer((s) => s.index)
  if (!placement) return null
  if (placement.excluded) return <p className="dialog-text muted" data-testid="placement">Not in the map: the config leaves this path out.</p>
  const layer = placement.layer ? index?.layerById.get(placement.layer) : undefined
  const role = placement.role ? index?.roles.get(placement.role) : undefined
  return (
    <p className="dialog-text placement" data-testid="placement" title={placement.reason}>
      Lands in the{' '}
      <span className="chip solid" style={{ ['--chip-color' as string]: layer?.color ?? 'var(--accent)' }}>
        {layer?.label ?? placement.layer}
      </span>{' '}
      layer, as{' '}
      <span className="chip solid" style={{ ['--chip-color' as string]: role?.color ?? 'var(--muted)' }}>
        {role?.label ?? placement.role}
      </span>
    </p>
  )
}

function CreateFile({ folder }: { folder: string }) {
  const files = useKnownFiles()
  const known = useMemo(() => new Set(files), [files])
  const folders = useMemo(() => foldersOf(files), [files])
  const [path, setPath] = useState(folder ? `${folder}/` : '')
  const [useTemplate, setUseTemplate] = useState(true)
  const [open, setOpen] = useState(true)
  const problem = pathProblem(path, known, folders)
  const touched = path.trim() !== (folder ? `${folder}/` : '')
  const template = problem ? null : templateFor(path.trim(), files)
  const placement = usePlacement(path.trim(), !problem)
  const submit = async () => {
    const target = path.trim()
    const created = await useFiles.getState().run({ op: 'create', path: target, content: template && useTemplate ? template.content : '' })
    if (!created) return
    const viewer = useViewer.getState()
    viewer.revealFile(created)
    if (open) viewer.openFile(created)
  }
  return (
    <Dialog title="New file" submitLabel="Create" disabled={!!problem} onSubmit={() => void submit()} onClose={close} testId="file-dialog">
      <Field label="Path" error={touched ? problem : null} hint="Relative to the repository; new folders are created too.">
        <input value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} autoComplete="off" data-testid="file-path" />
      </Field>
      <PlacementNote placement={placement} />
      {template && (
        <label className="check-field">
          <input type="checkbox" checked={useTemplate} onChange={(e) => setUseTemplate(e.target.checked)} /> Start with: {template.label}
        </label>
      )}
      <label className="check-field">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Open it in the editor
      </label>
    </Dialog>
  )
}

function RenamePath({ path, folder }: { path: string; folder: boolean }) {
  const files = useKnownFiles()
  const known = useMemo(() => new Set(files), [files])
  const folders = useMemo(() => foldersOf(files), [files])
  const [target, setTarget] = useState(path)
  const clean = target.trim().replace(/\/+$/, '')
  const problem = clean === path ? null : clean.startsWith(`${path}/`) ? 'A folder cannot move into itself.' : pathProblem(clean, known, folders)
  const placement = usePlacement(clean, !folder && !problem && clean !== path)
  const submit = async () => {
    const renamed = await useFiles.getState().run({ op: 'rename', from: path, to: clean })
    if (renamed && !folder) useViewer.getState().revealFile(renamed)
  }
  return (
    <Dialog
      title={`Rename or move ${folder ? 'folder' : 'file'}`}
      submitLabel={clean.split('/').slice(0, -1).join('/') === path.split('/').slice(0, -1).join('/') ? 'Rename' : 'Move'}
      disabled={!!problem || clean === path}
      onSubmit={() => void submit()}
      onClose={close}
      testId="file-dialog"
    >
      <Field label="New path" error={problem} hint={folder ? 'Everything inside moves along.' : 'Change the folder part to move it; imports are not updated.'}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          data-testid="file-path"
          onFocus={(e) => {
            // Select the name without its extension, like editors do.
            const slash = path.lastIndexOf('/') + 1
            const dot = folder ? -1 : path.indexOf('.', slash)
            e.target.setSelectionRange(slash, dot > slash ? dot : path.length)
          }}
        />
      </Field>
      <PlacementNote placement={placement} />
    </Dialog>
  )
}

function DeletePath({ path, folder, count }: { path: string; folder: boolean; count: number }) {
  return (
    <Dialog
      title={`Delete ${path.split('/').pop()}${folder ? '/' : ''}?`}
      submitLabel={folder ? `Delete ${count} ${count === 1 ? 'file' : 'files'}` : 'Delete'}
      danger
      onSubmit={() => void useFiles.getState().run({ op: 'delete', path })}
      onClose={close}
      testId="file-dialog"
    >
      <p className="dialog-text">
        <code>{path}</code>
        {folder ? ` and the ${count} ${count === 1 ? 'file' : 'files'} in it are` : ' is'} deleted from your working copy. Committed versions stay in the git history, and the
        History tab can discard the deletion.
      </p>
    </Dialog>
  )
}
