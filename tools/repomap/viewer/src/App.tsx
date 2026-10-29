import { lazy, Suspense, useEffect, useState } from 'react'
import { ChatDock } from './ai/ChatDock.tsx'
import { SettingsDialog } from './ai/SettingsDialog.tsx'
import { BOARD_FOCUS_EVENT, FILES_CHANGED_EVENT, useAssistant } from './ai/store.ts'
import { showOnBoard } from './board/show.ts'
import { useBoard } from './board/store.ts'
import { useGitActions } from './git/actions.ts'
import { ensureGitHistory, reloadServerHistory } from './git/load.ts'
import { useGit } from './git/store.ts'
import { useFiles } from './model/files.ts'
import { loadInitialGraph } from './model/load.ts'
import { matches, NARROW } from './model/media.ts'
import { useViewer } from './model/store.ts'
import { FileDialogs } from './ui/FileDialogs.tsx'
import { Banner, DropZone, HelpOverlay, Status, Toast } from './ui/Overlays.tsx'
import { TopBar } from './ui/TopBar.tsx'

// The editor (CodeMirror + grammars) loads only when code is first opened, the history tab when first shown.
const CodeViewer = lazy(() => import('./ui/code/CodeViewer.tsx'))
const GitView = lazy(() => import('./git/GitView.tsx'))
const BoardView = lazy(() => import('./board/BoardView.tsx'))

export function App() {
  const tab = useViewer((s) => s.tab)
  const theme = useViewer((s) => s.theme)
  const codeView = useViewer((s) => s.codeView)
  const revealed = useViewer((s) => s.revealed)
  const [gitShown, setGitShown] = useState(tab === 'git')
  const [boardShown, setBoardShown] = useState(tab === 'board')

  useEffect(() => {
    void loadInitialGraph().then(() => {
      // Your own repository, served by repomap: the explorer lists git's files and can change them, and the assistant works in it.
      if (useViewer.getState().source?.kind === 'server') {
        void useFiles.getState().refresh()
        void useAssistant.getState().init()
      }
    })
  }, [])

  useEffect(() => {
    if (tab === 'board') setBoardShown(true)
    if (tab !== 'git') return
    setGitShown(true)
    ensureGitHistory()
  }, [tab])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // The assistant changed files or ran git: the explorer, the git bar and the history catch up.
  useEffect(() => {
    const refresh = () => {
      void useFiles.getState().refresh()
      if (useGitActions.getState().available) void useGitActions.getState().refresh()
      void reloadServerHistory()
    }
    window.addEventListener(FILES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(FILES_CHANGED_EVENT, refresh)
  }, [])

  // The assistant pointed at parts of the app: open the board on them.
  useEffect(() => {
    const onFocus = (event: Event) => {
      const refs = (event as CustomEvent<unknown>).detail
      const index = useViewer.getState().index
      if (!index || !Array.isArray(refs)) return
      const nodes = refs.map((ref) => (typeof ref === 'string' ? (index.byId.get(ref) ?? index.nodes.findIndex((n) => n.label === ref)) : -1)).filter((i) => i >= 0)
      showOnBoard(nodes)
    }
    window.addEventListener(BOARD_FOCUS_EVENT, onFocus)
    return () => window.removeEventListener(BOARD_FOCUS_EVENT, onFocus)
  }, [])

  // A file created or renamed here, once a rebuild brought it in: the board opens on it.
  useEffect(() => {
    if (revealed) showOnBoard([revealed.node])
  }, [revealed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const store = useViewer.getState()
      // ⌘J / Ctrl+J: the assistant, from anywhere (the code panel included).
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'j' && useAssistant.getState().available) {
        event.preventDefault()
        const assistant = useAssistant.getState()
        assistant.setOpen(!assistant.open)
        return
      }
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (store.tab === 'git') {
        onGitKey(event, !!typing)
        return
      }
      if (!store.codeView && !target?.closest('[role="dialog"], [role="menu"]')) onBoardKey(event, !!typing)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app theme-${theme} tab-${tab}`}>
      <TopBar />
      {/* Both tabs stay mounted (inert while hidden), each loaded when first shown. */}
      <main className="panels">
        <div className={`workspace board-tab${tab === 'board' ? '' : ' inactive'}`} id="panel-board" role="tabpanel" aria-labelledby="tab-board" inert={tab !== 'board'} data-testid="board-view">
          {boardShown && (
            <Suspense
              fallback={
                <div className="status">
                  <div className="spinner" aria-hidden="true" />
                  <p>Loading the board…</p>
                </div>
              }
            >
              <BoardView />
            </Suspense>
          )}
          <Status />
          <Banner />
        </div>
        <div className={`workspace git-workspace${tab === 'git' ? '' : ' inactive'}`} id="panel-git" role="tabpanel" aria-labelledby="tab-git" inert={tab !== 'git'} data-testid="git-view">
          {gitShown && (
            <Suspense
              fallback={
                <div className="status">
                  <div className="spinner" aria-hidden="true" />
                  <p>Loading the history…</p>
                </div>
              }
            >
              <GitView />
            </Suspense>
          )}
        </div>
      </main>
      {codeView && (
        <Suspense
          fallback={
            <div className="code-backdrop">
              <div className="code-dialog code-loading">
                <div className="spinner" aria-hidden="true" /> Loading the editor…
              </div>
            </div>
          }
        >
          <CodeViewer />
        </Suspense>
      )}
      <ChatDock />
      <SettingsDialog />
      <FileDialogs />
      <HelpOverlay />
      <DropZone />
      <Toast />
    </div>
  )
}

/** Board tab: Esc goes up a level (or clears the selection), F fits, / finds a chip. */
function onBoardKey(event: KeyboardEvent, typing: boolean): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('[data-testid="board-search"]')?.focus()
    return
  }
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return
  const viewer = useViewer.getState()
  const board = useBoard.getState()
  const command = (detail: string) => window.dispatchEvent(new CustomEvent('repomap:board', { detail }))
  switch (event.key) {
    case 'Escape': {
      if (viewer.helpOpen) viewer.setHelp(false)
      else if (board.selected) board.select(null)
      else board.back()
      break
    }
    case '/':
      event.preventDefault()
      document.querySelector<HTMLInputElement>('[data-testid="board-search"]')?.focus()
      break
    case 'f':
    case 'F':
      command('fit')
      break
    case '+':
    case '=':
      command('in')
      break
    case '-':
      command('out')
      break
    case '?':
      viewer.setHelp(!viewer.helpOpen)
      break
  }
}

function focusGitSearch(): void {
  if (matches(NARROW)) useGit.getState().setSearchExpanded(true)
  else document.querySelector<HTMLInputElement>('[data-testid="git-search"]')?.focus()
}

/** History tab: ↑/↓ (j/k) walk the commits, n/N the search matches, H goes to HEAD. */
function onGitKey(event: KeyboardEvent, typing: boolean): void {
  const git = useGit.getState()
  const viewer = useViewer.getState()
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    focusGitSearch()
    return
  }
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('[role="tablist"], [role="menu"], [role="dialog"]')) return
  const moves: Record<string, () => void> = {
    ArrowDown: () => git.move(1),
    j: () => git.move(1),
    ArrowUp: () => git.move(-1),
    k: () => git.move(-1),
    PageDown: () => git.move(15),
    PageUp: () => git.move(-15),
    Home: () => git.selectEdge('first'),
    End: () => git.selectEdge('last'),
  }
  if (moves[event.key]) {
    event.preventDefault()
    moves[event.key]()
    return
  }
  switch (event.key) {
    case '/':
      event.preventDefault()
      focusGitSearch()
      break
    case 'n':
      git.step(1)
      break
    case 'N':
      git.step(-1)
      break
    case 'h':
    case 'H':
      git.jumpToHead()
      break
    case '[':
      git.togglePanel()
      break
    case '?':
      viewer.setHelp(!viewer.helpOpen)
      break
    case 'Escape':
      if (viewer.helpOpen) viewer.setHelp(false)
      else if (git.selected) git.select(null)
      else if (git.path) git.setPath(null)
      break
  }
}
