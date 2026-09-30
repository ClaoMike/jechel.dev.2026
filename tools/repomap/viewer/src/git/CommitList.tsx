/**
 * The commit graph: a virtualised list (only the rows on screen are in the DOM) with the lanes
 * drawn in one SVG next to them.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { WORKTREE, type GitCommit, type GitPullRequest, type GitWorkingTree } from '../../../src/shared/git-types.ts'
import { NARROW, useMediaQuery } from '../model/media.ts'
import { useViewer } from '../model/store.ts'
import { edgePath } from './lanes.ts'
import { fullDate, refBadges, relativeTime, shortHash, type GitModel, type RefBadge } from './model.ts'
import { Avatar, laneColor, PrBadge, RefBadgeView } from './parts.tsx'
import { useGit } from './store.ts'

interface Metrics {
  rowHeight: number
  laneWidth: number
  pad: number
  maxLanes: number
  /** Where the dot sits in the row (two-line rows: next to the first line). */
  dotY: number
}

const WIDE: Metrics = { rowHeight: 30, laneWidth: 16, pad: 13, maxLanes: 14, dotY: 15 }
const COMPACT: Metrics = { rowHeight: 54, laneWidth: 13, pad: 12, maxLanes: 7, dotY: 18 }
const OVERSCAN = 10
const MAX_BADGES = 3

export function CommitList({ model }: { model: GitModel }) {
  const selected = useGit((s) => s.selected)
  const flags = useGit((s) => s.matchFlags)
  const scroll = useGit((s) => s.scroll)
  const theme = useViewer((s) => s.theme)
  const narrow = useMediaQuery(NARROW)
  const metrics = narrow ? COMPACT : WIDE
  const { rowHeight, laneWidth, pad, maxLanes, dotY } = metrics
  const lanesShown = Math.max(1, Math.min(model.lanes.width, maxLanes))
  const graphWidth = pad * 2 + (lanesShown - 1) * laneWidth
  const x = (lane: number) => pad + Math.min(lane, lanesShown - 1) * laneWidth
  const y = (row: number) => row * rowHeight + dotY

  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 0 })

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }))
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  // Keyboard moves, search steps and links bring their row into view (above the phone sheet).
  useEffect(() => {
    const el = scroller.current
    if (!scroll || !el) return
    const top = scroll.row * rowHeight
    const covered = narrow ? Math.min(el.clientHeight * 0.6, window.innerHeight * 0.46) : 0
    const visible = Math.max(rowHeight, el.clientHeight - covered)
    if (top < el.scrollTop || top + rowHeight > el.scrollTop + visible) el.scrollTo({ top: Math.max(0, top - visible / 3) })
  }, [scroll, rowHeight, narrow])

  const remoteNames = useMemo(() => model.history.repo.remotes.map((r) => r.name), [model])
  const total = model.rows.length
  const first = Math.max(0, Math.floor(view.top / rowHeight) - OVERSCAN)
  const last = Math.min(total - 1, Math.ceil((view.top + (view.height || 900)) / rowHeight) + OVERSCAN)
  const head = model.history.repo.head
  const faded = (row: number) => flags !== null && row < total && flags[row] === 0

  const edges = []
  for (const edge of model.lanes.edges) {
    if (edge.from > last) break
    if (edge.to < first) continue
    const worktree = model.rows[edge.from].hash === WORKTREE
    edges.push(
      <path
        key={`${edge.from}-${edge.to}-${edge.lane}`}
        d={edgePath(edge, x, y)}
        stroke={worktree ? 'var(--faint)' : laneColor(edge.color, theme)}
        strokeDasharray={worktree ? '3 3' : undefined}
        className={faded(edge.from) && (edge.to >= total || faded(edge.to)) ? 'faded' : undefined}
      />,
    )
  }

  const dots = []
  const rows = []
  for (let row = first; row <= last; row++) {
    const entry = model.rows[row]
    const cx = x(model.lanes.lane[row])
    const cy = y(row)
    const color = laneColor(model.lanes.color[row], theme)
    const commit = entry.commit
    const isHead = !!commit && head?.commit === entry.hash
    if (!commit) {
      dots.push(<circle key={entry.hash} cx={cx} cy={cy} r={5} className="dot worktree" />)
    } else {
      const merge = commit.parents.length > 1
      dots.push(
        <g key={entry.hash} className={faded(row) ? 'faded' : undefined}>
          {isHead && <circle cx={cx} cy={cy} r={8.5} fill="none" stroke={color} strokeWidth={1.6} />}
          {merge ? <circle cx={cx} cy={cy} r={3.8} className="dot merge" style={{ stroke: color }} /> : <circle cx={cx} cy={cy} r={4.8} className="dot" fill={color} />}
        </g>,
      )
    }
    rows.push(
      <CommitRow
        key={entry.hash}
        hash={entry.hash}
        commit={commit}
        tree={commit ? undefined : model.history.workingTree}
        headBranch={head?.branch}
        top={row * rowHeight}
        height={rowHeight}
        selected={selected === entry.hash}
        dimmed={faded(row)}
        color={color}
        badges={refBadges(model.refsAt.get(entry.hash) ?? [], remoteNames, head?.branch)}
        prs={model.prsAt.get(entry.hash)}
        ghost={model.ghostAt.get(entry.hash)}
        narrow={narrow}
      />,
    )
  }

  const activeInView = selected !== null && (model.rowOf.get(selected) ?? -1) >= first && (model.rowOf.get(selected) ?? -1) <= last

  return (
    <div className={`git-list${narrow ? ' narrow' : ''}`} style={{ ['--graph-width' as string]: `${graphWidth}px` }}>
      {!narrow && (
        <div className="git-list-header" aria-hidden="true">
          <span />
          <span>Description</span>
          <span className="git-col-author">Author</span>
          <span>Date</span>
          <span className="git-col-hash">Commit</span>
        </div>
      )}
      <div
        ref={scroller}
        className="git-scroll"
        role="listbox"
        aria-label="Commits, newest first"
        aria-activedescendant={activeInView ? `commit-${selected}` : undefined}
        tabIndex={0}
        data-testid="commit-list"
      >
        <div className="git-canvas" style={{ height: total * rowHeight + (narrow ? 0 : 8) }}>
          <svg className="git-graph" width={graphWidth} height={Math.max(0, last - first + 1) * rowHeight} style={{ top: first * rowHeight }} aria-hidden="true">
            <g transform={`translate(0 ${-first * rowHeight})`}>
              {edges}
              {dots}
            </g>
          </svg>
          {rows}
        </div>
      </div>
    </div>
  )
}

interface RowProps {
  hash: string
  commit: GitCommit | null
  tree?: GitWorkingTree
  headBranch?: string
  top: number
  height: number
  selected: boolean
  dimmed: boolean
  color: string
  badges: RefBadge[]
  prs?: GitPullRequest[]
  ghost?: string
  narrow: boolean
}

const CommitRow = memo(
  function CommitRow({ hash, commit, tree, headBranch, top, height, selected, dimmed, color, badges, prs, ghost, narrow }: RowProps) {
    const select = () => useGit.getState().select(hash, narrow)
    const className = `git-row${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}${commit ? '' : ' worktree'}`
    if (!commit) {
      const parts = tree
        ? [tree.staged && `${tree.staged} staged`, tree.unstaged && `${tree.unstaged} modified`, tree.untracked && `${tree.untracked} untracked`, tree.conflicted && `${tree.conflicted} conflicts`].filter(Boolean)
        : []
      return (
        <div id={`commit-${hash}`} role="option" aria-selected={selected} className={className} style={{ top, height }} onClick={select} data-testid="worktree-row">
          <span className="git-cell-graph" />
          <span className="git-desc">
            <span className="wip-badge">Uncommitted changes</span>
            <span className="git-subject muted">{parts.join(' · ')}</span>
          </span>
          <span className="git-meta">
            <span className="git-author">{headBranch ? `on ${headBranch}` : 'detached HEAD'}</span>
            <span className="git-date">now</span>
            <span className="git-hash" />
          </span>
        </div>
      )
    }
    const shown = badges.slice(0, MAX_BADGES)
    const hidden = badges.length - shown.length
    return (
      <div
        id={`commit-${hash}`}
        role="option"
        aria-selected={selected}
        className={className}
        style={{ top, height }}
        onClick={select}
        data-hash={hash}
      >
        <span className="git-cell-graph" />
        <span className="git-desc">
          {shown.map((badge) => (
            <RefBadgeView key={`${badge.type}:${badge.label}`} badge={badge} color={color} compact={narrow} />
          ))}
          {hidden > 0 && (
            <span className="ref-badge more" title={badges.slice(MAX_BADGES).map((b) => b.label).join(', ')}>
              +{hidden}
            </span>
          )}
          {prs?.map((pr) => <PrBadge key={pr.number} pr={pr} />)}
          {ghost && (
            <span className="ref-badge ghost" style={{ ['--badge' as string]: color }} title={`Branch ${ghost}, merged (no ref points here any more)`}>
              <span className="ref-name">{ghost}</span>
            </span>
          )}
          <span className="git-subject" title={commit.subject}>
            {commit.subject}
          </span>
        </span>
        <span className="git-meta">
          <span className="git-author" title={commit.coAuthors ? `${commit.author}, with ${commit.coAuthors.join(', ')}` : commit.author}>
            <Avatar name={commit.author} size={narrow ? 16 : 18} />
            <span className="git-author-name">{commit.author}</span>
          </span>
          <span className="git-date" title={fullDate(commit.date)}>
            {relativeTime(commit.date)}
          </span>
          <span className="git-hash">{shortHash(hash)}</span>
        </span>
      </div>
    )
  },
  (a, b) =>
    a.hash === b.hash &&
    a.commit === b.commit &&
    a.tree === b.tree &&
    a.top === b.top &&
    a.height === b.height &&
    a.selected === b.selected &&
    a.dimmed === b.dimmed &&
    a.color === b.color &&
    a.prs === b.prs &&
    a.ghost === b.ghost &&
    a.narrow === b.narrow &&
    a.headBranch === b.headBranch &&
    a.badges.length === b.badges.length &&
    a.badges.every((badge, i) => badge.label === b.badges[i].label && badge.head === b.badges[i].head && badge.remotes.length === b.badges[i].remotes.length),
)
