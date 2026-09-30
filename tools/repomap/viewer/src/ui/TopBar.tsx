import { useRef } from 'react'
import { GitMenu, GitSearch, GitTools } from '../git/GitBar.tsx'
import { useGit } from '../git/store.ts'
import type { ColorBy } from '../model/colors.ts'
import { loadGraphFile } from '../model/load.ts'
import { useViewer, type LabelMode } from '../model/store.ts'
import { Icon } from './icons.tsx'
import { MenuSheet, MoreIcon } from './menu.tsx'
import { SearchBox } from './SearchBox.tsx'
import { Tabs } from './Tabs.tsx'

const COLOR_OPTIONS: { value: ColorBy; label: string }[] = [
  { value: 'kind', label: 'Kind' },
  { value: 'layer', label: 'Layer' },
  { value: 'role', label: 'Role' },
  { value: 'feature', label: 'Feature' },
]

const LABEL_OPTIONS: { value: LabelMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'all', label: 'All' },
  { value: 'none', label: 'Selection' },
]

export function TopBar() {
  const tab = useViewer((s) => s.tab)
  const index = useViewer((s) => s.index)
  const source = useViewer((s) => s.source)
  const viewMenuOpen = useViewer((s) => s.viewMenuOpen)
  const file = useRef<HTMLInputElement>(null)
  const meta = index?.graph.meta
  const openFile = () => file.current?.click()
  const map = tab === 'map'

  return (
    <header className="topbar">
      <div className="brand">
        <button
          type="button"
          className="icon-button"
          onClick={() => (map ? useViewer.getState().toggleSidebar() : useGit.getState().togglePanel())}
          aria-label={map ? 'Toggle filters' : 'Toggle branches panel'}
          title={map ? 'Filters  [' : 'Branches & pull requests  ['}
        >
          <Icon name="menu" />
        </button>
        <span className="logo" aria-hidden="true">
          <Icon name="layers" size={18} />
        </span>
        <span className="brand-name">repomap</span>
        <Tabs />
        {meta && (
          <span className="repo" title={meta.repo.root ?? meta.repo.name}>
            <strong>{meta.repo.name}</strong>
            {meta.repo.branch && (
              <span className="git">
                {meta.repo.branch}
                {meta.repo.commit ? ` @ ${meta.repo.commit}` : ''}
                {meta.repo.dirty ? <span className="dirty" title="Uncommitted changes">●</span> : null}
              </span>
            )}
            <span className="built" title={new Date(meta.generatedAt).toLocaleString()}>
              {source?.kind === 'demo' ? 'demo' : `built ${timeAgo(meta.generatedAt)}`}
            </span>
          </span>
        )}
      </div>

      {map ? <SearchBox /> : <GitSearch />}

      <div className="toolbar">{map ? <MapTools onOpenFile={openFile} /> : <GitTools onOpenFile={openFile} />}</div>

      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="open-file"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) void loadGraphFile(picked)
          e.target.value = ''
        }}
      />
      {viewMenuOpen && (map ? <ViewMenu onOpenFile={openFile} /> : <GitMenu onOpenFile={openFile} />)}
    </header>
  )
}

function MapTools({ onOpenFile }: { onOpenFile: () => void }) {
  const index = useViewer((s) => s.index)
  const colorBy = useViewer((s) => s.colorBy)
  const labels = useViewer((s) => s.labels)
  const theme = useViewer((s) => s.theme)
  const viewMenuOpen = useViewer((s) => s.viewMenuOpen)
  const { command, setColorBy, setLabels, setTheme, setHelp, setSearchExpanded, setViewMenu } = useViewer.getState()
  return (
    <>
      <div className="wide-only">
        <div className="segmented" role="group" aria-label="Camera">
          <button type="button" onClick={() => command({ type: 'fit' })} title="Fit visible  (F)">
            <Icon name="fit" size={15} /> <span className="hide-md">Fit</span>
          </button>
          <button type="button" onClick={() => command({ type: 'side' })} title="Side view — the layer stack  (S)">
            <Icon name="side" size={15} /> <span className="hide-md">Side</span>
          </button>
          <select
            aria-label="Top view of a layer"
            title="Top-down view of one layer  (1–9)"
            value=""
            onChange={(e) => e.target.value && command({ type: 'layer', layer: e.target.value })}
          >
            <option value="">Top ▾</option>
            {index?.planes.map((plane, k) => (
              <option key={plane.layer} value={plane.layer}>
                {k + 1} · {index.layerById.get(plane.layer)?.label ?? plane.layer}
              </option>
            ))}
          </select>
        </div>

        <label className="select-label" title="Colour nodes by  (C)">
          <span className="hide-md">Color</span>
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)} aria-label="Color by">
            {COLOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="select-label" title="Labels  (L)">
          <span className="hide-md">Labels</span>
          <select value={labels} onChange={(e) => setLabels(e.target.value as LabelMode)} aria-label="Labels">
            {LABEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" title="Light/dark">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button type="button" className="icon-button" onClick={onOpenFile} aria-label="Open graph.json" title="Open a graph.json (or drop it anywhere)">
          <Icon name="open" />
        </button>
        <button type="button" className="icon-button" onClick={() => setHelp(true)} aria-label="Help" title="Help & shortcuts  (?)">
          <Icon name="help" />
        </button>
      </div>

      <div className="narrow-only">
        <button type="button" className="icon-button" onClick={() => setSearchExpanded(true)} aria-label="Search">
          <Icon name="search" />
        </button>
        <button type="button" className="icon-button" onClick={() => setViewMenu(!viewMenuOpen)} aria-label="View options" aria-expanded={viewMenuOpen} aria-haspopup="dialog">
          <MoreIcon />
        </button>
      </div>
    </>
  )
}

/** Phones: everything the wide toolbar has, as a dropdown sheet. */
function ViewMenu({ onOpenFile }: { onOpenFile: () => void }) {
  const index = useViewer((s) => s.index)
  const colorBy = useViewer((s) => s.colorBy)
  const labels = useViewer((s) => s.labels)
  const theme = useViewer((s) => s.theme)
  const { command, setColorBy, setLabels, setTheme, setHelp, setViewMenu } = useViewer.getState()
  const close = () => setViewMenu(false)

  const act = (fn: () => void) => () => {
    fn()
    close()
  }
  return (
    <MenuSheet label="View options" onClose={close} testId="view-menu">
      <div className="view-menu-section">
        <div className="view-menu-title">Camera</div>
        <div className="view-menu-row">
          <button type="button" className="chip" onClick={act(() => command({ type: 'fit' }))}>
            <Icon name="fit" size={14} /> Fit
          </button>
          <button type="button" className="chip" onClick={act(() => command({ type: 'side' }))}>
            <Icon name="side" size={14} /> Side
          </button>
          <button type="button" className="chip" onClick={act(() => command({ type: 'reset' }))}>
            <Icon name="reset" size={14} /> Reset
          </button>
        </div>
        <div className="view-menu-row">
          {index?.planes.map((plane) => (
            <button key={plane.layer} type="button" className="chip" onClick={act(() => command({ type: 'layer', layer: plane.layer }))}>
              <Icon name="top" size={14} /> {index.layerById.get(plane.layer)?.label ?? plane.layer}
            </button>
          ))}
        </div>
      </div>
      <div className="view-menu-section">
        <div className="view-menu-title">Colour by</div>
        <div className="view-menu-row" role="group" aria-label="Color by">
          {COLOR_OPTIONS.map((o) => (
            <button key={o.value} type="button" className={`chip${colorBy === o.value ? ' active' : ''}`} aria-pressed={colorBy === o.value} onClick={() => setColorBy(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="view-menu-section">
        <div className="view-menu-title">Labels</div>
        <div className="view-menu-row" role="group" aria-label="Labels">
          {LABEL_OPTIONS.map((o) => (
            <button key={o.value} type="button" className={`chip${labels === o.value ? ' active' : ''}`} aria-pressed={labels === o.value} onClick={() => setLabels(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="view-menu-section view-menu-row">
        <button type="button" className="chip" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} /> {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
        <button type="button" className="chip" onClick={act(onOpenFile)}>
          <Icon name="open" size={14} /> Open graph…
        </button>
        <button type="button" className="chip" onClick={act(() => setHelp(true))}>
          <Icon name="help" size={14} /> Help
        </button>
      </div>
    </MenuSheet>
  )
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}
