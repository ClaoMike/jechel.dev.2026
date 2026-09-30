import { lazy, Suspense, useEffect } from 'react'
import type { ColorBy } from './model/colors.ts'
import { loadInitialGraph } from './model/load.ts'
import { COARSE, NARROW, useMediaQuery } from './model/media.ts'
import { useViewer, type LabelMode } from './model/store.ts'
import { writeViewToHash } from './model/url.ts'
import { Scene } from './scene/Scene.tsx'
import { ContextMenu } from './ui/ContextMenu.tsx'
import { DetailsPanel } from './ui/DetailsPanel.tsx'
import { Banner, DropZone, HelpOverlay, Status, Toast } from './ui/Overlays.tsx'
import { Sidebar } from './ui/Sidebar.tsx'
import { TopBar } from './ui/TopBar.tsx'

// The editor (CodeMirror + grammars) loads only when code is first opened.
const CodeViewer = lazy(() => import('./ui/code/CodeViewer.tsx'))

const COLOR_CYCLE: ColorBy[] = ['kind', 'layer', 'role', 'feature']
const LABEL_CYCLE: LabelMode[] = ['auto', 'all', 'none']

export function App() {
  const theme = useViewer((s) => s.theme)
  const sidebarOpen = useViewer((s) => s.sidebarOpen)
  const selected = useViewer((s) => s.selected)
  const codeView = useViewer((s) => s.codeView)
  const searchExpanded = useViewer((s) => s.searchExpanded)
  const narrow = useMediaQuery(NARROW)

  useEffect(() => {
    void loadInitialGraph()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

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
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('[data-testid="search"]')?.focus()
        return
      }
      // The code panel and the node menu handle their own keys.
      if (store.codeView || store.contextMenu) return
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
    <div className={`app theme-${theme}${sidebarOpen ? ' with-sidebar' : ''}${selected !== null ? ' with-details' : ''}${searchExpanded ? ' search-expanded' : ''}`}>
      <TopBar />
      <main className="workspace">
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
      <HelpOverlay />
      <DropZone />
      <Toast />
    </div>
  )
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
