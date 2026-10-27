import { lazy, Suspense, useEffect, useState } from 'react'
import { ChatDock } from './ai/ChatDock.tsx'
import { SettingsDialog } from './ai/SettingsDialog.tsx'
import { BOARD_FOCUS_EVENT, FILES_CHANGED_EVENT, useAssistant } from './ai/store.ts'
import { indexBoard, parentPath, pathOfNode } from './board/model.ts'
import { useBoard } from './board/store.ts'
import { useGitActions } from './git/actions.ts'
import { ensureGitHistory, reloadServerHistory } from './git/load.ts'
import { useGit } from './git/store.ts'
import type { ColorBy } from './model/colors.ts'
import { useFiles } from './model/files.ts'
import { loadInitialGraph } from './model/load.ts'
import { COARSE, matches, NARROW, useMediaQuery } from './model/media.ts'
import { useViewer, type LabelMode } from './model/store.ts'
import { writeViewToHash } from './model/url.ts'
import { Scene } from './scene/Scene.tsx'
import { ContextMenu } from './ui/ContextMenu.tsx'
import { DetailsPanel } from './ui/DetailsPanel.tsx'
import { FileDialogs } from './ui/FileDialogs.tsx'
import { Banner, DropZone, HelpOverlay, Status, Toast } from './ui/Overlays.tsx'
import { Sidebar } from './ui/Sidebar.tsx'
import { TopBar } from './ui/TopBar.tsx'

// The editor (CodeMirror + grammars) loads only when code is first opened, the history tab when first shown.
const CodeViewer = lazy(() => import('./ui/code/CodeViewer.tsx'))
const GitView = lazy(() => import('./git/GitView.tsx'))
const BoardView = lazy(() => import('./board/BoardView.tsx'))

const COLOR_CYCLE: ColorBy[] = ['kind', 'layer', 'role', 'feature']
const LABEL_CYCLE: LabelMode[] = ['auto', 'all', 'none']

export function App() {
  const tab = useViewer((s) => s.tab)
  const theme = useViewer((s) => s.theme)
  const sidebarOpen = useViewer((s) => s.sidebarOpen)
  const selected = useViewer((s) => s.selected)
  const codeView = useViewer((s) => s.codeView)
  const searchExpanded = useViewer((s) => s.searchExpanded)
  const narrow = useMediaQuery(NARROW)
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
      if (nodes.length === 0) return
      const bi = indexBoard(index)
      useViewer.getState().setTab('board')
      const board = useBoard.getState()
      const path = pathOfNode(bi, nodes[0], board.options)
      if (bi.hidden[bi.rootOf[nodes[0]]] && !board.options.showHidden) board.setOption('showHidden', true)
      if (path.level === 'chip') board.navigate({ level: 'chips', tier: path.tier, feature: path.feature, ...(path.group !== undefined ? { group: path.group } : {}) }, 'in', path.chip)
      board.setFocus(nodes)
    }
    window.addEventListener(BOARD_FOCUS_EVENT, onFocus)
    return () => window.removeEventListener(BOARD_FOCUS_EVENT, onFocus)
  }, [])

  // Keep the URL hash (and localStorage) in sync with the view, so links are shareable.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return useViewer.subscribe((state, previous) => {
      if (!state.index) return
      if (
        state.filters === previous.filters &&
        state.presetId === previous.presetId &&
        state.selected === previous.selected &&
        state.colorBy === previous.colorBy &&
        state.labels === previous.labels
      ) return
      clearTimeout(timer)
      timer = setTimeout(() => writeViewToHash(useViewer.getState().viewState()), 250)
    })
  }, [])

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
      if (store.tab === 'board') {
        if (!store.codeView && !target?.closest('[role="dialog"], [role="menu"]')) onBoardKey(event, !!typing)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('[data-testid="search"]')?.focus()
        return
      }
      // The code panel, the node menu and dialogs handle their own keys.
      if (store.codeView || store.contextMenu || target?.closest('[role="dialog"], [role="menu"]')) return
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      switch (event.key) {
        case '/':
          event.preventDefault()
          document.querySelector<HTMLInputElement>('[data-testid="search"]')?.focus()
          break
        case 'Escape':
          if (store.helpOpen) store.setHelp(false)
          else store.select(null)
          break
        case 'f':
        case 'F':
          store.command({ type: 'fit' })
          break
        case 's':
        case 'S':
          store.command({ type: 'side' })
          break
        case 'r':
        case 'R':
          store.command({ type: 'reset' })
          break
        case 'c':
        case 'C':
          store.setColorBy(COLOR_CYCLE[(COLOR_CYCLE.indexOf(store.colorBy) + 1) % COLOR_CYCLE.length])
          break
        case 'l':
        case 'L':
          store.setLabels(LABEL_CYCLE[(LABEL_CYCLE.indexOf(store.labels) + 1) % LABEL_CYCLE.length])
          break
        case '[':
          store.toggleSidebar()
          break
        case '?':
          store.setHelp(!store.helpOpen)
          break
        default:
          if (/^[1-9]$/.test(event.key) && store.index) {
            const plane = store.index.planes[Number(event.key) - 1]
            if (plane) store.command({ type: 'layer', layer: plane.layer })
          }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app theme-${theme} tab-${tab}${sidebarOpen ? ' with-sidebar' : ''}${selected !== null ? ' with-details' : ''}${searchExpanded ? ' search-expanded' : ''}`}>
      <TopBar />
      {/* Both tabs stay mounted (the 3D scene keeps its camera); the hidden one is inert and paused. */}
      <main className="panels">
        <div className={`workspace${tab === 'map' ? '' : ' inactive'}`} id="panel-map" role="tabpanel" aria-labelledby="tab-map" inert={tab !== 'map'}>
          <Sidebar />
          {narrow && sidebarOpen && <div className="drawer-backdrop" onClick={() => useViewer.getState().setSidebar(false)} aria-hidden="true" />}
          <div className="stage">
            <Scene />
            <ContextMenu />
            <Banner />
            <Status />
            <Hint />
          </div>
          <DetailsPanel />
        </div>
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
      else {
        const up = parentPath(board.path)
        if (up) board.navigate(up, 'out')
      }
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

function Hint() {
  const selected = useViewer((s) => s.selected)
  const index = useViewer((s) => s.index)
  const interacted = useViewer((s) => s.interacted)
  const touch = useMediaQuery(COARSE)
  if (!index || selected !== null) return null
  if (touch) {
    if (interacted) return null
    return (
      <div className="hint touch" data-testid="hint">
        drag to rotate · pinch to zoom · two fingers to pan · tap a node to trace it · long-press for code
      </div>
    )
  }
  return (
    <div className="hint" data-testid="hint">
      <kbd>drag</kbd> rotate · <kbd>right-drag</kbd> pan · <kbd>scroll</kbd> zoom · <kbd>click</kbd> a node to trace it · <kbd>right-click</kbd> code · <kbd>?</kbd> help
    </div>
  )
}
