import { useRef } from 'react'
import { useAssistant } from '../ai/store.ts'
import { GitMenu, GitSearch, GitTools } from '../git/GitBar.tsx'
import { useBoard } from '../board/store.ts'
import { useGit } from '../git/store.ts'
import { loadGraphFile } from '../model/load.ts'
import { useViewer } from '../model/store.ts'
import { Icon } from './icons.tsx'
import { Tabs } from './Tabs.tsx'

export function TopBar() {
  const tab = useViewer((s) => s.tab)
  const index = useViewer((s) => s.index)
  const source = useViewer((s) => s.source)
  const viewMenuOpen = useViewer((s) => s.viewMenuOpen)
  const file = useRef<HTMLInputElement>(null)
  const meta = index?.graph.meta
  const openFile = () => file.current?.click()
  const board = tab === 'board'

  return (
    <header className="topbar">
      <div className="brand">
        <button
          type="button"
          className="icon-button"
          onClick={() => (board ? useBoard.getState().setSheetOpen(!useBoard.getState().sheetOpen) : useGit.getState().togglePanel())}
          aria-label={board ? 'Toggle the board panel' : 'Toggle branches panel'}
          title={board ? 'Board panel' : 'Branches & pull requests  ['}
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

      {board ? <div className="search-spacer" /> : <GitSearch />}

      <div className="toolbar">
        {board ? <BoardTools onOpenFile={openFile} /> : <GitTools onOpenFile={openFile} />}
        <AssistantButtons />
      </div>

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
      {viewMenuOpen && !board && <GitMenu onOpenFile={openFile} />}
    </header>
  )
}

/** Board tab: the panels, the theme, opening a graph and help (zoom is on the board itself). */
function BoardTools({ onOpenFile }: { onOpenFile: () => void }) {
  const theme = useViewer((s) => s.theme)
  const panel = useBoard((s) => s.panel)
  const violations = useViewer((s) => s.index?.graph.board?.violations?.length ?? 0)
  const { setTheme, setHelp } = useViewer.getState()
  const open = (id: 'review' | 'rules' | 'ai') => useBoard.getState().setPanel(id)
  return (
    <>
      <div className="segmented" role="group" aria-label="Board panels">
        <button type="button" className={panel === 'review' ? 'active' : ''} onClick={() => open('review')} title="Review a change on the board" data-testid="board-tool-review">
          <Icon name="commit" size={15} /> <span className="hide-md">Review</span>
        </button>
        <button type="button" className={panel === 'rules' ? 'active' : ''} onClick={() => open('rules')} title="Architecture rules" data-testid="board-tool-rules">
          <Icon name="warn" size={15} /> <span className="hide-md">Rules{violations ? ` (${violations})` : ''}</span>
        </button>
        <button type="button" className={panel === 'ai' ? 'active' : ''} onClick={() => open('ai')} title="AI summaries">
          <Icon name="sparkle" size={15} /> <span className="hide-md">AI</span>
        </button>
      </div>
      <button type="button" className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" title="Light/dark">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button type="button" className="icon-button wide-only-inline" onClick={onOpenFile} aria-label="Open graph.json" title="Open a graph.json (or drop it anywhere)">
        <Icon name="open" />
      </button>
      <button type="button" className="icon-button wide-only-inline" onClick={() => setHelp(true)} aria-label="Help" title="Help & shortcuts  (?)">
        <Icon name="help" />
      </button>
    </>
  )
}

/** Show/hide the assistant, and its settings (only when repomap serves your own repository). */
function AssistantButtons() {
  const available = useAssistant((s) => s.available)
  const open = useAssistant((s) => s.open)
  if (!available) return null
  const { setOpen, setSettingsOpen } = useAssistant.getState()
  return (
    <>
      <button
        type="button"
        className={`icon-button assistant-toggle${open ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Hide the assistant' : 'Show the assistant'}
        aria-pressed={open}
        title="Assistant  (⌘J)"
        data-testid="assistant-toggle"
      >
        <Icon name="sparkle" />
      </button>
      <button type="button" className="icon-button wide-only-inline" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings" data-testid="settings-button">
        <Icon name="gear" />
      </button>
    </>
  )
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}
