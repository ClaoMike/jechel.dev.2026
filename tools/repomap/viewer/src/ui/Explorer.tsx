/**
 * The file explorer (the side panel's "Files" tab): the repository as a folder tree, each file with
 * the colour of the layer it is drawn on. Click a file to find it in the map, double-click to open its
 * code; the ⋯ menus create, rename, move and delete files and folders when the server allows it.
 */
import { useMemo, useState } from 'react'
import { useGit } from '../git/store.ts'
import { filesIn, useFiles } from '../model/files.ts'
import { buildTree, type Folder } from '../model/tree.ts'
import type { GraphIndex } from '../model/graph.ts'
import { useViewer } from '../model/store.ts'
import { ActionMenu, type MenuItem } from './ActionMenu.tsx'
import { Icon } from './icons.tsx'

/** Repo path → the node that stands for it in the map. */
function nodesByFile(index: GraphIndex | null): Map<string, number> {
  const map = new Map<string, number>()
  index?.nodes.forEach((node, i) => {
    if (!node.file) return
    const current = map.get(node.file)
    if (current === undefined || (node.id.includes(':file:') && !index.nodes[current].id.includes(':file:')) || (!node.parent && index.nodes[current].parent)) map.set(node.file, i)
  })
  return map
}

function readExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('repomap.explorer') ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

type Row = { type: 'folder'; folder: Folder; depth: number } | { type: 'file'; path: string; depth: number }

export function Explorer() {
  const index = useViewer((s) => s.index)
  const selected = useViewer((s) => s.selected)
  const listed = useFiles((s) => s.files)
  const writable = useFiles((s) => s.writable)
  const [filter, setFilter] = useState('')
  const [expanded, setExpandedState] = useState(readExpanded)
  const files = useMemo(() => listed ?? [...new Set(index?.nodes.map((n) => n.file).filter((f): f is string => !!f) ?? [])].sort(), [listed, index])
  const tree = useMemo(() => buildTree(files), [files])
  const nodes = useMemo(() => nodesByFile(index), [index])
  const current = selected !== null ? index?.nodes[selected]?.file : undefined

  const setExpanded = (next: Set<string>) => {
    setExpandedState(next)
    try {
      localStorage.setItem('repomap.explorer', JSON.stringify([...next]))
    } catch {
      // A private window: not remembered.
    }
  }
  const toggle = (path: string) => {
    const next = new Set(expanded)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setExpanded(next)
  }

  const query = filter.trim().toLowerCase()
  const rows: Row[] = []
  if (query) {
    for (const path of files) if (path.toLowerCase().includes(query)) rows.push({ type: 'file', path, depth: 0 })
  } else {
    const walk = (folder: Folder, depth: number) => {
      for (const child of [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        rows.push({ type: 'folder', folder: child, depth })
        if (expanded.has(child.path)) walk(child, depth + 1)
      }
      for (const path of folder.files) rows.push({ type: 'file', path, depth })
    }
    walk(tree, 0)
  }
  const shown = rows.slice(0, 1500)

  return (
    <div className="explorer" data-testid="explorer">
      <div className="explorer-tools">
        <div className="explorer-filter">
          <Icon name="search" size={14} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files" aria-label="Filter files" spellCheck={false} data-testid="explorer-filter" />
        </div>
        {writable && (
          <button type="button" className="icon-button small" onClick={() => useFiles.getState().openDialog({ kind: 'create', folder: '' })} aria-label="New file" title="New file" data-testid="explorer-new-file">
            <Icon name="plus" size={15} />
          </button>
        )}
        <button type="button" className="icon-button small" onClick={() => setExpanded(new Set())} aria-label="Collapse all folders" title="Collapse all">
          <Icon name="up" size={14} />
        </button>
      </div>
      <ul className="plain explorer-tree" aria-label="Files">
        {shown.map((row) =>
          row.type === 'folder' ? (
            <FolderRow key={`d:${row.folder.path}`} folder={row.folder} depth={row.depth} open={expanded.has(row.folder.path)} onToggle={() => toggle(row.folder.path)} files={files} writable={!!writable} />
          ) : (
            <FileRow
              key={`f:${row.path}`}
              path={row.path}
              depth={row.depth}
              node={nodes.get(row.path)}
              index={index}
              current={row.path === current}
              full={!!query}
              writable={!!writable}
            />
          ),
        )}
      </ul>
      {query && rows.length === 0 && <p className="panel-empty">No file matches “{filter.trim()}”.</p>}
      {rows.length > shown.length && <p className="panel-empty">{rows.length - shown.length} more — filter to find them.</p>}
      {writable === false && <p className="panel-empty explorer-note">Read-only: files can be created, renamed and deleted when repomap serves your own repository (npm start).</p>}
    </div>
  )
}

function FolderRow({ folder, depth, open, onToggle, files, writable }: { folder: Folder; depth: number; open: boolean; onToggle(): void; files: readonly string[]; writable: boolean }) {
  const { openDialog } = useFiles.getState()
  const items: MenuItem[] = [
    { label: 'New file here…', icon: 'plus', disabled: !writable, onSelect: () => openDialog({ kind: 'create', folder: folder.path }) },
    { label: 'Rename or move…', icon: 'edit', disabled: !writable, onSelect: () => openDialog({ kind: 'rename', path: folder.path, folder: true }) },
    { label: 'Copy path', icon: 'copy', onSelect: () => void navigator.clipboard?.writeText(folder.path) },
    { separator: true },
    {
      label: 'Delete folder…',
      icon: 'trash',
      danger: true,
      disabled: !writable,
      onSelect: () => openDialog({ kind: 'delete', path: folder.path, folder: true, count: filesIn(files, folder.path).length }),
    },
  ]
  return (
    <li className="explorer-row folder" style={{ ['--depth' as string]: depth }} data-testid={`folder-${folder.path}`}>
      <button type="button" className="explorer-main" onClick={onToggle} aria-expanded={open} title={folder.path}>
        <span className={`expander-icon${open ? ' open' : ''}`} aria-hidden="true">
          <Icon name="chevron" size={11} />
        </span>
        <Icon name="open" size={14} />
        <span className="explorer-name">{folder.name}</span>
        <span className="facet-count">{folder.count}</span>
      </button>
      <ActionMenu label={`Commands for folder ${folder.path}`} items={items} className="dim-toggle explorer-menu" testId={`explorer-menu-${folder.path}`}>
        <Icon name="more" size={14} />
      </ActionMenu>
    </li>
  )
}

function FileRow(props: { path: string; depth: number; node?: number; index: GraphIndex | null; current: boolean; full: boolean; writable: boolean }) {
  const { path, depth, node, index, current, full, writable } = props
  const viewer = useViewer.getState()
  const { openDialog } = useFiles.getState()
  const slash = path.lastIndexOf('/')
  const layer = node !== undefined && index ? index.layerById.get(index.nodes[node].layer) : undefined
  const show = () => {
    if (node !== undefined) viewer.select(node, true)
    else viewer.openFile(path)
  }
  const items: MenuItem[] = [
    { label: 'Open code', icon: 'code', onSelect: () => viewer.openFile(path) },
    { label: 'Show in the map', icon: 'layers', disabled: node === undefined, title: node === undefined ? 'Not in the map (yet)' : undefined, onSelect: () => node !== undefined && viewer.select(node, true) },
    {
      label: 'History',
      icon: 'clock',
      onSelect: () => {
        useGit.getState().setPath(path)
        viewer.setTab('git')
      },
    },
    { label: 'Copy path', icon: 'copy', onSelect: () => void navigator.clipboard?.writeText(path) },
    { separator: true },
    { label: 'New file next to it…', icon: 'plus', disabled: !writable, onSelect: () => openDialog({ kind: 'create', folder: slash >= 0 ? path.slice(0, slash) : '' }) },
    { label: 'Rename or move…', icon: 'edit', disabled: !writable, onSelect: () => openDialog({ kind: 'rename', path, folder: false }) },
    { label: 'Delete…', icon: 'trash', danger: true, disabled: !writable, onSelect: () => openDialog({ kind: 'delete', path, folder: false, count: 1 }) },
  ]
  return (
    <li className={`explorer-row file${current ? ' current' : ''}`} style={{ ['--depth' as string]: depth }} data-testid={`file-${path}`}>
      <button
        type="button"
        className="explorer-main"
        onClick={show}
        onDoubleClick={() => viewer.openFile(path)}
        title={`${path}${layer ? ` — ${layer.label}` : ' — not in the map'}\nClick: find it in the map · double-click: open the code`}
      >
        <span className="expander-icon" aria-hidden="true" />
        <span className={`swatch round${layer ? '' : ' empty'}`} style={layer ? { background: layer.color } : undefined} aria-hidden="true" />
        <span className="explorer-name">
          {full && slash >= 0 && <span className="file-dir">{path.slice(0, slash + 1)}</span>}
          {slash >= 0 ? path.slice(slash + 1) : path}
        </span>
      </button>
      <button type="button" className="dim-toggle explorer-code" onClick={() => viewer.openFile(path)} aria-label={`Open ${path}`} title="Open the code">
        <Icon name="code" size={13} />
      </button>
      <ActionMenu label={`Commands for ${path}`} items={items} className="dim-toggle explorer-menu" testId={`explorer-menu-${path}`}>
        <Icon name="more" size={14} />
      </ActionMenu>
    </li>
  )
}
