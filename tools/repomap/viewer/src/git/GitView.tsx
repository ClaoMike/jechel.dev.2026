/**
 * The History tab: branches & pull requests | commit graph | commit details. Loaded on first use
 * (its own chunk) and kept mounted afterwards, so the scroll position survives tab switches.
 * App renders the tab panel around it.
 */
import { NARROW, useMediaQuery } from '../model/media.ts'
import { Icon } from '../ui/icons.tsx'
import { CommitDetails } from './CommitDetails.tsx'
import { CommitList } from './CommitList.tsx'
import type { GitModel } from './model.ts'
import { RefsPanel } from './RefsPanel.tsx'
import { useGit } from './store.ts'

export default function GitView() {
  const status = useGit((s) => s.status)
  const model = useGit((s) => s.model)
  const message = useGit((s) => s.message)
  const panelOpen = useGit((s) => s.panelOpen)
  const selected = useGit((s) => s.selected)
  const narrow = useMediaQuery(NARROW)

  return (
    <>
      <RefsPanel model={model} />
      {narrow && panelOpen && <div className="drawer-backdrop" onClick={() => useGit.getState().setPanel(false)} aria-hidden="true" />}
      <section className="git-main" aria-label="Commit graph">
        {status === 'ready' && model ? (
          <>
            <FilterBar model={model} />
            {model.rows.length > 0 ? (
              <CommitList model={model} />
            ) : (
              <div className="status">
                <Icon name="git" size={22} />
                <h2>{model.history.commits.length === 0 ? 'No commits yet' : 'Nothing to show'}</h2>
                <p>{model.history.commits.length === 0 ? 'Make a first commit and it shows up here.' : 'Every branch is hidden by the filters.'}</p>
                {model.history.commits.length > 0 && (
                  <button type="button" className="chip" onClick={() => useGit.getState().resetFilters()}>
                    Show everything
                  </button>
                )}
              </div>
            )}
          </>
        ) : status === 'missing' || status === 'error' ? (
          <div className={`status${status === 'error' ? ' error' : ''}`} role={status === 'error' ? 'alert' : undefined}>
            <Icon name={status === 'error' ? 'warn' : 'git'} size={22} />
            <h2>{status === 'error' ? 'Could not load the history' : 'No git history'}</h2>
            <p>{message}</p>
          </div>
        ) : (
          <div className="status">
            <div className="spinner" aria-hidden="true" />
            <p>Reading the history…</p>
          </div>
        )}
      </section>
      {model && selected && <CommitDetails model={model} />}
    </>
  )
}

function FilterBar({ model }: { model: GitModel }) {
  const path = useGit((s) => s.path)
  const query = useGit((s) => s.query)
  const matches = useGit((s) => s.matches)
  const source = useGit((s) => s.source)
  const history = model.history
  const { setPath, resetFilters, setQuery } = useGit.getState()
  const items = []
  if (path) {
    items.push(
      <span key="path" className="filter-chip" data-testid="path-filter">
        <Icon name="file" size={13} />
        <span>
          History of <code title={path}>{path}</code>: {matches?.length ?? 0} {matches?.length === 1 ? 'commit' : 'commits'}
        </span>
        <button type="button" className="icon-button small" onClick={() => setPath(null)} aria-label="Stop following this file">
          <Icon name="close" size={13} />
        </button>
      </span>,
    )
  } else if (query.trim() && matches) {
    items.push(
      <span key="query" className="filter-chip">
        <Icon name="search" size={13} />
        <span>
          {matches.length} {matches.length === 1 ? 'commit matches' : 'commits match'} “{query.trim()}”
        </span>
        <button type="button" className="icon-button small" onClick={() => setQuery('')} aria-label="Clear the search">
          <Icon name="close" size={13} />
        </button>
      </span>,
    )
  }
  if (model.hiddenCommits > 0) {
    items.push(
      <span key="hidden" className="filter-chip">
        <span>
          {model.hiddenCommits} {model.hiddenCommits === 1 ? 'commit is' : 'commits are'} only on hidden branches
        </span>
        <button type="button" className="link-button" onClick={resetFilters}>
          Show all
        </button>
      </span>,
    )
  }
  if (history.truncated) {
    items.push(
      <span key="truncated" className="filter-chip muted" title="Raise history.maxCommits in the config to read more">
        Newest {history.commits.length} of {history.totalCommits ?? 'more'} commits
      </span>,
    )
  }
  if (source?.kind === 'demo') {
    items.push(
      <span key="demo" className="filter-chip accent">
        A demo history. <code>npm run map</code> in <code>tools/repomap</code> shows your repository's.
      </span>,
    )
  }
  if (items.length === 0) return null
  return <div className="git-filterbar">{items}</div>
}
