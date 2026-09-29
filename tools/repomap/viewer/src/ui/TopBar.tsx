import { useRef } from 'react'
import type { ColorBy } from '../model/colors.ts'
import { loadGraphFile } from '../model/load.ts'
import { useViewer, type LabelMode } from '../model/store.ts'
import { Icon } from './icons.tsx'
import { SearchBox } from './SearchBox.tsx'

export function TopBar() {
  const index = useViewer((s) => s.index)
  const source = useViewer((s) => s.source)
  const colorBy = useViewer((s) => s.colorBy)
  const labels = useViewer((s) => s.labels)
  const theme = useViewer((s) => s.theme)
  const { toggleSidebar, command, setColorBy, setLabels, setTheme, setHelp } = useViewer.getState()
  const file = useRef<HTMLInputElement>(null)
  const meta = index?.graph.meta

  return (
    <header className="topbar">
      <div className="brand">
        <button type="button" className="icon-button" onClick={toggleSidebar} aria-label="Toggle filters ([)" title="Filters  [">
          <Icon name="menu" />
        </button>
        <span className="logo" aria-hidden="true">
          <Icon name="layers" size={18} />
        </span>
        <span className="brand-name">repomap</span>
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

      <SearchBox />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Camera">
          <button type="button" onClick={() => command({ type: 'fit' })} title="Fit visible  (F)">
            <Icon name="fit" size={15} /> <span className="hide-sm">Fit</span>
          </button>
          <button type="button" onClick={() => command({ type: 'side' })} title="Side view — the layer stack  (S)">
            <Icon name="side" size={15} /> <span className="hide-sm">Side</span>
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
          <span className="hide-sm">Color</span>
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)} aria-label="Color by">
            <option value="kind">Kind</option>
            <option value="layer">Layer</option>
            <option value="role">Role</option>
            <option value="feature">Feature</option>
          </select>
        </label>

        <label className="select-label" title="Labels  (L)">
          <span className="hide-sm">Labels</span>
          <select value={labels} onChange={(e) => setLabels(e.target.value as LabelMode)} aria-label="Labels">
            <option value="auto">Auto</option>
            <option value="all">All</option>
            <option value="none">Selection</option>
          </select>
        </label>

        <button type="button" className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" title="Light/dark">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button type="button" className="icon-button" onClick={() => file.current?.click()} aria-label="Open graph.json" title="Open a graph.json (or drop it anywhere)">
          <Icon name="open" />
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0]
            if (picked) void loadGraphFile(picked)
            e.target.value = ''
          }}
        />
        <button type="button" className="icon-button" onClick={() => setHelp(true)} aria-label="Help" title="Help & shortcuts  (?)">
          <Icon name="help" />
        </button>
      </div>
    </header>
  )
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}
