import { useEffect, useState } from 'react'
import { loadGraphFile } from '../model/load.ts'
import { useViewer } from '../model/store.ts'
import { EdgeIcon, Icon, ShapeIcon } from './icons.tsx'

export function HelpOverlay() {
  const open = useViewer((s) => s.helpOpen)
  const index = useViewer((s) => s.index)
  const setHelp = useViewer((s) => s.setHelp)
  if (!open) return null
  const kinds = index ? [...index.layerKinds.values()].flat().filter((k, i, all) => all.indexOf(k) === i).map((k) => index.kinds.get(k)!) : []
  const edgeTypes = index ? index.presentEdgeTypes.map((t) => index.edgeTypes.get(t)!) : []
  return (
    <div className="modal-backdrop" onClick={() => setHelp(false)} role="presentation">
      <div className="modal" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>How to read and drive the map</h2>
          <button type="button" className="icon-button" onClick={() => setHelp(false)} aria-label="Close help">
            <Icon name="close" />
          </button>
        </header>
        <div className="help-grid">
          <section>
            <h3>Mouse &amp; trackpad</h3>
            <ul className="keys">
              <li><kbd>drag</kbd> rotate</li>
              <li><kbd>right-drag</kbd> / <kbd>⇧ drag</kbd> pan</li>
              <li><kbd>wheel</kbd> / <kbd>pinch</kbd> zoom to cursor</li>
              <li><kbd>click</kbd> select &amp; trace</li>
              <li><kbd>double-click</kbd> fly to a node (empty space: fit)</li>
            </ul>
            <h3>Keyboard</h3>
            <ul className="keys">
              <li><kbd>/</kbd> or <kbd>⌘K</kbd> search</li>
              <li><kbd>F</kbd> fit · <kbd>S</kbd> side view · <kbd>R</kbd> reset</li>
              <li><kbd>1</kbd>…<kbd>9</kbd> top-down view of a layer</li>
              <li><kbd>C</kbd> colour by · <kbd>L</kbd> labels · <kbd>[</kbd> filters</li>
              <li><kbd>Esc</kbd> clear selection</li>
            </ul>
            <h3>Trace mode</h3>
            <p>
              Selecting a node lights up everything it depends on (<strong>↓ downstream</strong>) and everything that depends on it (<strong>↑ upstream</strong>), across
              layers — e.g. page → API call → endpoint → service → entity → table. Particles flow in the direction of each dependency. Tests, migrations and config
              are shown one hop around the selection.
            </p>
            <h3>Filters</h3>
            <p>
              Every layer, kind, role and edge type can be shown, <Icon name="dim" size={12} /> dimmed (kept as faint context) or hidden. <kbd>⌥</kbd>-click a row to
              show only that one. Positions never move when you filter.
            </p>
          </section>
          <section>
            <h3>Shapes</h3>
            <ul className="legend">
              {kinds.map((kind) => (
                <li key={kind.id} title={kind.description}>
                  <ShapeIcon shape={kind.shape} color={kind.color} /> {kind.label}
                </li>
              ))}
            </ul>
            <h3>Edges</h3>
            <ul className="legend">
              {edgeTypes.map((type) => (
                <li key={type.id} title={type.description}>
                  <EdgeIcon color={type.color} /> {type.label}
                  {type.flow && <span className="muted"> · flow</span>}
                </li>
              ))}
            </ul>
            <p className="muted">Planes are layers; thin planes just below a layer hold its tests, config and generated code. Dashed lines are rolled-up edges of hidden children.</p>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Drop a graph.json anywhere on the page. */
export function DropZone() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth++
      setActive(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setActive(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) void loadGraphFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])
  if (!active) return null
  return (
    <div className="dropzone">
      <div>
        <Icon name="open" size={28} />
        <p>Drop a repomap graph.json to view it</p>
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useViewer((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(timer)
  }, [toast])
  if (!toast || !visible) return null
  return (
    <div className="toast" role="status">
      {toast.text}
    </div>
  )
}

export function Banner() {
  const source = useViewer((s) => s.source)
  const [dismissed, setDismissed] = useState(false)
  if (source?.kind !== 'demo' || dismissed) return null
  return (
    <div className="banner" role="note">
      <span>
        You're looking at a <strong>demo graph</strong>. Map your own repo with <code>npm run map</code> in <code>tools/repomap</code>, or drop a
        <code>graph.json</code> here.
      </span>
      <button type="button" className="icon-button" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

export function Status() {
  const loading = useViewer((s) => s.loading)
  const error = useViewer((s) => s.error)
  if (error) {
    return (
      <div className="status error" role="alert">
        <Icon name="warn" size={22} />
        <h2>Could not load the graph</h2>
        <p>{error}</p>
        <p className="muted">Build one with <code>npm run map</code> in <code>tools/repomap</code>, or drop a graph.json on this page.</p>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="status">
        <div className="spinner" aria-hidden="true" />
        <p>Loading the map…</p>
      </div>
    )
  }
  return null
}
