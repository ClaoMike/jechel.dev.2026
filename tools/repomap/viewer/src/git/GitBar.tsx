/** The History tab's part of the top bar: commit search, jump buttons and (phones) its menu. */
import { useEffect, useRef } from 'react'
import { useViewer } from '../model/store.ts'
import { Icon } from '../ui/icons.tsx'
import { MenuSheet, MoreIcon } from '../ui/menu.tsx'
import { useGit } from './store.ts'

export function GitSearch() {
  const query = useGit((s) => s.query)
  const matches = useGit((s) => s.matches)
  const selected = useGit((s) => s.selected)
  const model = useGit((s) => s.model)
  const path = useGit((s) => s.path)
  const expanded = useGit((s) => s.searchExpanded)
  const { setQuery, step, setSearchExpanded } = useGit.getState()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (expanded) input.current?.focus()
  }, [expanded])

  const active = !!(query.trim() || path) && matches !== null
  const position = active && selected && model ? matches!.indexOf(model.rowOf.get(selected) ?? -1) + 1 : 0
  return (
    <div className={`search git-search${expanded ? ' expanded' : ''}`} role="search">
      <Icon name="search" size={15} />
      <input
        ref={input}
        value={query}
        placeholder="Search commits, authors, files, #PR…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            step(-1)
          } else if (e.key === 'Escape') {
            if (query) setQuery('')
            else {
              setSearchExpanded(false)
              input.current?.blur()
            }
          }
        }}
        aria-label="Search commits"
        data-testid="git-search"
      />
      {active && (
        <>
          <span className="match-count" aria-live="polite" data-testid="match-count">
            {matches!.length === 0 ? 'none' : `${position || '–'}/${matches!.length}`}
          </span>
          <button type="button" className="icon-button small" onClick={() => step(-1)} aria-label="Previous match" disabled={matches!.length === 0}>
            <Icon name="up" size={14} />
          </button>
          <button type="button" className="icon-button small" onClick={() => step(1)} aria-label="Next match" disabled={matches!.length === 0}>
            <Icon name="down" size={14} />
          </button>
        </>
      )}
      <button type="button" className="icon-button narrow-only-inline" onClick={() => setSearchExpanded(false)} aria-label="Close search">
        <Icon name="close" />
      </button>
    </div>
  )
}

export function GitTools({ onOpenFile }: { onOpenFile: () => void }) {
  const theme = useViewer((s) => s.theme)
  const viewMenuOpen = useViewer((s) => s.viewMenuOpen)
  const hasHead = useGit((s) => !!s.model && !!s.history?.repo.head && s.model.rowOf.has(s.history.repo.head.commit))
  const { setTheme, setHelp, setViewMenu } = useViewer.getState()
  const { jumpToHead, selectEdge, setSearchExpanded } = useGit.getState()
  return (
    <>
      <div className="wide-only">
        <div className="segmented" role="group" aria-label="Go to">
          <button type="button" onClick={jumpToHead} disabled={!hasHead} title="The checked-out commit  (H)">
            <Icon name="commit" size={15} /> <span className="hide-md">HEAD</span>
          </button>
          <button type="button" onClick={() => selectEdge('first')} title="The newest commit  (Home)">
            <Icon name="up" size={15} /> <span className="hide-md">Newest</span>
          </button>
        </div>
        <button type="button" className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" title="Light/dark">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button type="button" className="icon-button" onClick={onOpenFile} aria-label="Open a file" title="Open a graph.json or git.json (or drop it anywhere)">
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
        <button type="button" className="icon-button" onClick={() => setViewMenu(!viewMenuOpen)} aria-label="View options" aria-expanded={viewMenuOpen} aria-haspopup="menu">
          <MoreIcon />
        </button>
      </div>
    </>
  )
}

/** Phones: jump buttons, what to show, theme, open, help. */
export function GitMenu({ onOpenFile }: { onOpenFile: () => void }) {
  const theme = useViewer((s) => s.theme)
  const filters = useGit((s) => s.filters)
  const history = useGit((s) => s.history)
  const { setTheme, setHelp, setViewMenu } = useViewer.getState()
  const { jumpToHead, selectEdge, setFilters } = useGit.getState()
  const close = () => setViewMenu(false)
  const act = (fn: () => void) => () => {
    fn()
    close()
  }
  const toggles: { key: 'remotes' | 'tags' | 'worktree'; label: string; available: boolean }[] = [
    { key: 'remotes', label: 'Remote branches', available: !!history?.refs.some((r) => r.type === 'remote') },
    { key: 'tags', label: 'Tags', available: !!history?.refs.some((r) => r.type === 'tag') },
    { key: 'worktree', label: 'Uncommitted changes', available: !!history?.workingTree },
  ]
  return (
    <MenuSheet label="View options" onClose={close} testId="view-menu">
      <div className="view-menu-section">
        <div className="view-menu-title">Go to</div>
        <div className="view-menu-row">
          <button type="button" className="chip" onClick={act(jumpToHead)} disabled={!history?.repo.head}>
            <Icon name="commit" size={14} /> HEAD
          </button>
          <button type="button" className="chip" onClick={act(() => selectEdge('first'))}>
            <Icon name="up" size={14} /> Newest
          </button>
          <button type="button" className="chip" onClick={act(() => selectEdge('last'))}>
            <Icon name="down" size={14} /> Oldest
          </button>
        </div>
      </div>
      {toggles.some((t) => t.available) && (
        <div className="view-menu-section">
          <div className="view-menu-title">Show</div>
          <div className="view-menu-row" role="group" aria-label="Show">
            {toggles
              .filter((t) => t.available)
              .map((t) => (
                <button key={t.key} type="button" className={`chip${filters[t.key] ? ' active' : ''}`} aria-pressed={filters[t.key]} onClick={() => setFilters({ [t.key]: !filters[t.key] })}>
                  {t.label}
                </button>
              ))}
          </div>
        </div>
      )}
      <div className="view-menu-section view-menu-row">
        <button type="button" className="chip" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} /> {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
        <button type="button" className="chip" onClick={act(onOpenFile)}>
          <Icon name="open" size={14} /> Open file…
        </button>
        <button type="button" className="chip" onClick={act(() => setHelp(true))}>
          <Icon name="help" size={14} /> Help
        </button>
      </div>
    </MenuSheet>
  )
}
