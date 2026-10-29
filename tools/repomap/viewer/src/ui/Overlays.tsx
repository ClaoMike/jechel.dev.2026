import { useEffect, useState } from 'react'
import { loadGraphFile } from '../model/load.ts'
import { useViewer } from '../model/store.ts'
import { Icon } from './icons.tsx'

export function HelpOverlay() {
  const open = useViewer((s) => s.helpOpen)
  const tab = useViewer((s) => s.tab)
  const setHelp = useViewer((s) => s.setHelp)
  if (!open) return null
  if (tab === 'git') return <GitHelp onClose={() => setHelp(false)} />
  return (
    <div className="modal-backdrop" onClick={() => setHelp(false)} role="presentation">
      <div className="modal" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>How to read and drive the board</h2>
          <button type="button" className="icon-button" onClick={() => setHelp(false)} aria-label="Close help">
            <Icon name="close" />
          </button>
        </header>
        <div className="help-grid">
          <section>
            <h3>Levels</h3>
            <p>
              The app, its tiers (frontend, backend, database…), a tier&apos;s features, a feature&apos;s chips, one chip. Zoom far into a chip to open it and far out to go up;
              the trail at the top goes back. Under it, where you are in the tier&apos;s architecture (its layer, slice and folders).
            </p>
            <h3>Mouse, trackpad &amp; touch</h3>
            <ul className="keys">
              <li><kbd>wheel</kbd> / <kbd>pinch</kbd> zoom · <kbd>drag</kbd> pan</li>
              <li><kbd>click</kbd> / <kbd>tap</kbd> select a chip · again to open it</li>
              <li><kbd>click</kbd> a wire for the connections it carries</li>
            </ul>
            <h3>Keyboard</h3>
            <ul className="keys">
              <li><kbd>/</kbd> or <kbd>⌘K</kbd> find a chip</li>
              <li><kbd>F</kbd> fit · <kbd>+</kbd> <kbd>-</kbd> zoom</li>
              <li><kbd>Esc</kbd> clear the selection, then up a level</li>
              <li><kbd>⌘J</kbd> the assistant</li>
            </ul>
          </section>
          <section>
            <h3>Wires</h3>
            <p>Thicker is more connections; dashed, a render that happens only in some state; red, a connection that breaks an architecture rule.</p>
            <h3>Panels</h3>
            <p>
              <strong>Details</strong> describes what&apos;s selected and reads its code; <strong>Files</strong> is the repository&apos;s explorer; <strong>Review</strong> lights up
              what a change touches; <strong>Rules</strong> lists what breaks the architecture; <strong>AI</strong> writes the summaries.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

function GitHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>How to read the history</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close help">
            <Icon name="close" />
          </button>
        </header>
        <div className="help-grid">
          <section>
            <h3>The graph</h3>
            <p>
              Newest commits on top. Each coloured line is a line of work: a commit sits on its branch's line, a fork is where a line leaves another, and a merge is
              where one joins another. The default branch stays on the far left.
            </p>
            <ul className="legend git-legend">
              <li>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="4.6" fill="#38bdf8" /></svg> commit
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="3.6" fill="none" stroke="#a78bfa" strokeWidth="2" /></svg> merge commit
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="#38bdf8" strokeWidth="1.5" /><circle cx="9" cy="9" r="4" fill="#38bdf8" /></svg> HEAD (checked out)
              </li>
              <li>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" /></svg> uncommitted changes
              </li>
            </ul>
            <h3>Badges</h3>
            <ul className="keys">
              <li><span className="ref-badge branch head" style={{ ['--badge' as string]: '#38bdf8' }}><span className="head-dot" />main</span> the checked-out branch</li>
              <li><span className="ref-badge branch" style={{ ['--badge' as string]: '#a78bfa' }}>feature</span> a local branch (a cloud: also on the remote)</li>
              <li><span className="ref-badge branch remote-only" style={{ ['--badge' as string]: '#f472b6' }}>origin/fix</span> only on the remote</li>
              <li><span className="ref-badge ghost" style={{ ['--badge' as string]: '#34d399' }}>old-branch</span> a merged branch that no longer exists</li>
              <li><span className="ref-badge tag">v1.0</span> a tag</li>
              <li>
                <span className="pr-badge open">#12</span> <span className="pr-badge merged">#9</span> <span className="pr-badge closed">#4</span> pull requests: open, merged, closed
              </li>
            </ul>
          </section>
          <section>
            <h3>Keyboard</h3>
            <ul className="keys">
              <li><kbd>↑</kbd> <kbd>↓</kbd> or <kbd>k</kbd> <kbd>j</kbd> previous / next commit</li>
              <li><kbd>Home</kbd> <kbd>End</kbd> newest / oldest · <kbd>H</kbd> HEAD</li>
              <li><kbd>/</kbd> or <kbd>⌘K</kbd> search · <kbd>Enter</kbd> / <kbd>n</kbd> <kbd>N</kbd> next / previous match</li>
              <li><kbd>[</kbd> branches panel · <kbd>Esc</kbd> close the details</li>
            </ul>
            <h3>Search</h3>
            <p>
              Every word must match the message, an author, a file path, a branch or a hash prefix; <code>#12</code> finds pull request 12. Non-matching commits
              fade out and the graph stays whole.
            </p>
            <h3>Branches &amp; pull requests</h3>
            <p>
              Untick a branch to hide the commits only it reaches; <kbd>⌥</kbd>-click (or the target button) shows only that one. Merged pull requests are read from
              merge and squash messages; open ones come from GitHub when the remote is there.
            </p>
            <h3>Files</h3>
            <p>
              A commit lists the files it changed. The clock button follows one file through the history; the board button shows where it is on the Board.
            </p>
            <p className="muted">Read-only: nothing here changes the repository.</p>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Drop a graph.json (or git.json) anywhere on the page. */
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
        <p>Drop a repomap graph.json or git.json to view it</p>
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
        <p>Loading the graph…</p>
      </div>
    )
  }
  return null
}
