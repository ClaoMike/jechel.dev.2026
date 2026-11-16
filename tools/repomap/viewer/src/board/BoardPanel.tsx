/**
 * The Board's side panel (a bottom sheet on phones): details of what is selected (or of the level),
 * review mode, the architecture rules, and the AI summaries job.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { WRITE_HEADER } from '../../../src/shared/git-actions.ts'
import { caseLabel, membersOf, renderCases, type Member, type Summary } from '../../../src/shared/board.ts'
import type { RenderCase, ShownElement } from '../../../src/shared/types.ts'
import { Markdown } from '../ai/Markdown.tsx'
import { ensureGitHistory } from '../git/load.ts'
import { useGit } from '../git/store.ts'
import { search } from '../model/search.ts'
import { useViewer } from '../model/store.ts'
import { Explorer } from '../ui/Explorer.tsx'
import { Icon } from '../ui/icons.tsx'
import { featureLabel, landingOf, tierLabel, type BoardChip, type BoardIndex, type BoardScene } from './model.ts'
import { loadReview, requestBriefing, reviewCommit, WORKTREE } from './review.ts'
import { useBoard, type BoardPanel as PanelId } from './store.ts'

const TABS: { id: PanelId; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'files', label: 'Files' },
  { id: 'review', label: 'Review' },
  { id: 'rules', label: 'Rules' },
  { id: 'ai', label: 'AI' },
]

export function BoardPanel({ bi, scene }: { bi: BoardIndex; scene: BoardScene | null }) {
  const panel = useBoard((s) => s.panel)
  const sheetOpen = useBoard((s) => s.sheetOpen)
  const violations = bi.board.violations?.length ?? 0
  const review = useBoard((s) => s.review)
  return (
    <aside className={`board-panel${sheetOpen ? ' expanded' : ''}`} aria-label="Board panel" data-testid="board-panel">
      <button
        type="button"
        className="sheet-handle narrow-only"
        onClick={() => useBoard.getState().setSheetOpen(!sheetOpen)}
        aria-label={sheetOpen ? 'Collapse the panel' : 'Expand the panel'}
        aria-expanded={sheetOpen}
      >
        <span />
      </button>
      <div className="board-panel-tabs" role="tablist" aria-label="Board panel">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={panel === tab.id}
            className={panel === tab.id ? 'active' : ''}
            onClick={() => useBoard.getState().setPanel(tab.id)}
            data-testid={`board-panel-${tab.id}`}
          >
            {tab.label}
            {tab.id === 'rules' && violations > 0 && <span className="count bad">{violations}</span>}
            {tab.id === 'review' && review && <span className="count touched">{review.touched.size}</span>}
          </button>
        ))}
      </div>
      <div className="board-panel-body" role="tabpanel">
        <BoardSearch bi={bi} />
        {panel === 'details' && <Details bi={bi} scene={scene} />}
        {panel === 'files' && <Explorer />}
        {panel === 'review' && <ReviewTab bi={bi} />}
        {panel === 'rules' && <RulesTab bi={bi} />}
        {panel === 'ai' && <AiTab bi={bi} />}
      </div>
    </aside>
  )
}

/** Jump to any chip by name. */
function BoardSearch({ bi }: { bi: BoardIndex }) {
  const [query, setQuery] = useState('')
  const options = useBoard((s) => s.options)
  const hits = useMemo(() => (query.trim() ? search(bi.index, query, 8) : []), [bi, query])
  const go = (i: number) => {
    const root = bi.rootOf[i]
    if (bi.hidden[root] && !options.showHidden) useBoard.getState().setOption('showHidden', true)
    // Open the feature's board with the chip selected, or its own board when it sits deeper.
    const landing = landingOf(bi, root, options)
    useBoard.getState().navigate(landing.path, 'in', landing.select)
    useBoard.getState().setFocus([i])
    setQuery('')
  }
  return (
    <div className="board-search">
      <input
        type="search"
        placeholder="Find a chip…"
        aria-label="Find a chip on the board"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) go(hits[0].i)
        }}
        data-testid="board-search"
      />
      {hits.length > 0 && (
        <ul className="board-search-hits" role="listbox" aria-label="Chips found">
          {hits.map((hit) => {
            const node = bi.index.nodes[hit.i]
            return (
              <li key={hit.i}>
                <button type="button" onClick={() => go(hit.i)}>
                  <strong>{node.label}</strong>
                  <span>
                    {bi.index.kinds.get(node.kind)?.label ?? node.kind} · {featureLabel(bi, bi.featureOf[hit.i])} · {tierLabel(bi, bi.tierOf[hit.i])}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SummaryBlock({ summary, fallback }: { summary?: Summary; fallback?: string }) {
  const aiAvailable = useBoard((s) => s.aiAvailable)
  if (summary) {
    return (
      <div className="board-summary">
        <p>{summary.text}</p>
        <span className="source-tag" title={summary.model ? `Written by ${summary.model}${summary.at ? ` on ${new Date(summary.at).toLocaleDateString()}` : ''}` : undefined}>
          AI summary{summary.stale ? ' · the code changed since' : ''}
        </span>
      </div>
    )
  }
  if (fallback) return <p className="description">{fallback}</p>
  return (
    <p className="muted small">
      No AI summary yet.{' '}
      {aiAvailable ? (
        <button type="button" className="link" onClick={() => useBoard.getState().setPanel('ai')}>
          Write summaries
        </button>
      ) : (
        'Run npm run summarize to write them.'
      )}
    </p>
  )
}

function Details({ bi, scene }: { bi: BoardIndex; scene: BoardScene | null }) {
  const selected = useBoard((s) => s.selected)
  if (!scene) return null
  if (selected?.startsWith('wire:')) {
    const wire = scene.wires.find((w) => w.id === selected.slice(5))
    if (wire) return <WireDetails bi={bi} scene={scene} wireId={wire.id} />
  }
  // A chip's own board is about that chip.
  const chip = selected ? scene.chips.find((c) => c.id === selected) : scene.path.level === 'chip' ? scene.chips[0] : undefined
  if (chip?.kind === 'state') return <StateDetails bi={bi} scene={scene} chip={chip} />
  if (chip) return <ChipDetails bi={bi} scene={scene} chip={chip} />
  return <LevelDetails bi={bi} scene={scene} />
}

function LevelDetails({ bi, scene }: { bi: BoardIndex; scene: BoardScene }) {
  const options = useBoard((s) => s.options)
  const path = scene.path
  const { setOption } = useBoard.getState()
  let title = bi.index.graph.meta.repo.name
  let summary: Summary | undefined = bi.board.summaries?.app
  let fallback: string | undefined
  if (path.level === 'features' || path.level === 'chips' || path.level === 'chip') {
    const tier = bi.tierById.get(path.tier)
    title = tier?.label ?? path.tier
    summary = bi.board.summaries?.[`tier:${path.tier}`]
    fallback = tier?.description
    if (path.level !== 'features') {
      title = `${featureLabel(bi, path.feature)} · ${title}`
      summary = bi.board.summaries?.[`feature:${path.feature}@${path.tier}`]
      fallback = undefined
    }
  }
  const chips = scene.chips.filter((c) => c.kind !== 'connector')
  return (
    <div className="board-details">
      <h2>{title}</h2>
      <SummaryBlock summary={summary} fallback={fallback} />
      <p className="muted small">
        {chips.length} chip{chips.length === 1 ? '' : 's'} · {scene.wires.length} wire{scene.wires.length === 1 ? '' : 's'} on this board. Tap a chip for its details; tap it again, or zoom far into it, to open it.
      </p>
      <div className="board-options">
        <label>
          <input type="checkbox" checked={options.showHidden} onChange={(e) => setOption('showHidden', e.target.checked)} data-testid="board-show-hidden" /> Tests, config & tooling
        </label>
        <label>
          <input type="checkbox" checked={options.typeLinks} onChange={(e) => setOption('typeLinks', e.target.checked)} /> Type references
        </label>
        <label>
          <input type="checkbox" checked={options.states !== false} onChange={(e) => setOption('states', e.target.checked)} data-testid="board-states" /> Components' states
        </label>
      </div>
    </div>
  )
}

const MEMBER_GROUPS: { kinds: string[]; label: string }[] = [
  { kinds: ['prop', 'param'], label: 'Props & parameters' },
  { kinds: ['state'], label: 'State' },
  { kinds: ['function', 'method', 'constructor'], label: 'Functions' },
  { kinds: ['value'], label: 'Values' },
  { kinds: ['property', 'field'], label: 'Properties & fields' },
]

function openAt(bi: BoardIndex, node: number, member?: Member) {
  const target = bi.index.nodes[node]
  if (!member?.line) {
    useViewer.getState().openCode(node)
    return
  }
  useViewer.setState({ codeView: { node: null, opened: { ...target, id: `${target.id}#${member.name}`, line: member.line, endLine: member.endLine ?? member.line } } })
}

function ChipDetails({ bi, scene, chip }: { bi: BoardIndex; scene: BoardScene; chip: BoardChip }) {
  const { navigate } = useBoard.getState()
  const node = chip.node !== undefined ? bi.index.nodes[chip.node] : undefined
  const members = node ? membersOf(node) : []
  const connections = useMemo(() => {
    const inc: { chip: BoardChip; count: number; types: string[] }[] = []
    const out: { chip: BoardChip; count: number; types: string[] }[] = []
    const byId = new Map(scene.chips.map((c) => [c.id, c]))
    for (const wire of scene.wires) {
      const other = wire.from === chip.id ? byId.get(wire.to) : wire.to === chip.id ? byId.get(wire.from) : undefined
      if (!other) continue
      const list = wire.from === chip.id ? out : inc
      const existing = list.find((x) => x.chip.id === other.id)
      if (existing) {
        existing.count += wire.count
        for (const t of Object.keys(wire.types)) if (!existing.types.includes(t)) existing.types.push(t)
      } else list.push({ chip: other, count: wire.count, types: Object.keys(wire.types) })
    }
    return { inc: inc.sort((a, b) => b.count - a.count), out: out.sort((a, b) => b.count - a.count) }
  }, [scene, chip])
  const onChip = (id: string) => {
    const i = bi.index.byId.get(id)
    return i !== undefined && bi.rootOf[i] === chip.node
  }
  const violations = node ? (bi.board.violations ?? []).filter((v) => onChip(v.from) || onChip(v.to)) : []
  return (
    <div className="board-details" data-testid="board-chip-details">
      <header className="board-details-head">
        <span className="swatch" style={{ background: chip.color }} aria-hidden="true" />
        <div>
          <h2>{chip.label}</h2>
          <div className="chips">
            {chip.sub && <span className="chip">{chip.sub}</span>}
            {node && <span className="chip">{featureLabel(bi, bi.featureOf[chip.node!])}</span>}
            {node && <span className="chip">{tierLabel(bi, bi.tierOf[chip.node!])}</span>}
            {chip.ghost && <span className="chip" title="Its home is another feature; only its parts in this feature are shown">shared</span>}
            {node?.featureSource && node.featureSource !== 'path' && <span className="chip" title="How it was placed in its feature">placed: {node.featureSource}</span>}
          </div>
        </div>
      </header>
      <div className="board-actions">
        {chip.enter && (
          <button type="button" className="chip solid-accent" onClick={() => navigate(chip.enter!, chip.kind === 'connector' ? null : 'in')} data-testid="board-open">
            <Icon name="focus" size={14} /> {chip.kind === 'connector' ? 'Go there' : 'Open'}
          </button>
        )}
        {node?.file && (
          <button type="button" className="chip" onClick={() => openAt(bi, chip.node!)} data-testid="board-read-code">
            <Icon name="code" size={14} /> Read the code
          </button>
        )}
        {node?.file && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              useGit.getState().setPath(node.file!)
              useViewer.getState().setTab('git')
            }}
            title="Its file's commits, in the history"
            data-testid="file-history"
          >
            <Icon name="clock" size={14} /> History
          </button>
        )}
      </div>
      <SummaryBlock summary={chip.summary} fallback={chip.kind === 'node' ? undefined : chip.description} />
      {node?.description && <p className="description">{node.description}</p>}
      {node?.file && (
        <p className="muted small mono">
          {node.file}
          {node.line ? `:${node.line}` : ''}
        </p>
      )}
      {(chip.touched > 0 || chip.impacted > 0) && (
        <p className="board-review-note">
          {chip.touched > 0 && <span className="pill touched">{chip.touched} changed</span>} {chip.impacted > 0 && <span className="pill impacted">{chip.impacted} may be affected</span>}
        </p>
      )}
      {node && bi.index.children[chip.node!].length > 0 && (
        <Section title={`Parts (${bi.index.children[chip.node!].length})`}>
          <ul className="board-list">
            {bi.index.children[chip.node!].map((child) => (
              <li key={child}>
                <button type="button" onClick={() => openAt(bi, child)} disabled={!bi.index.nodes[child].file}>
                  {bi.index.nodes[child].label}
                  <span className="muted"> {bi.index.kinds.get(bi.index.nodes[child].kind)?.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {MEMBER_GROUPS.map((group) => {
        const list = members.filter((m) => group.kinds.includes(m.kind))
        if (list.length === 0) return null
        return (
          <Section key={group.label} title={`${group.label} (${list.length})`}>
            <ul className="board-list">
              {list.map((member) => (
                <li key={`${member.name}:${member.line}`}>
                  <button type="button" onClick={() => openAt(bi, chip.node!, member)} title={member.line ? `Line ${member.line}` : undefined}>
                    <span className={`member-dot m-${member.kind}`} aria-hidden="true" />
                    {member.name}
                    {member.type && <span className="muted mono"> {member.type}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )
      })}
      {node && <RenderStates bi={bi} scene={scene} node={chip.node!} />}
      {connections.inc.length > 0 && <Connections title="Wires in" items={connections.inc} />}
      {connections.out.length > 0 && <Connections title="Wires out" items={connections.out} />}
      {violations.length > 0 && (
        <Section title={`Rule violations (${violations.length})`}>
          <ul className="board-list">
            {violations.map((v, k) => (
              <li key={k} className="bad-text">
                {v.message}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

/** A state chip: the condition, what it reads, its component and what it shows then. */
function StateDetails({ bi, scene, chip }: { bi: BoardIndex; scene: BoardScene; chip: BoardChip }) {
  const owner = chip.owner !== undefined ? bi.index.nodes[chip.owner] : undefined
  const byId = new Map(scene.chips.map((c) => [c.id, c]))
  const shows = scene.wires.filter((w) => w.from === chip.id).map((w) => byId.get(w.to)).filter((c): c is BoardChip => !!c)
  return (
    <div className="board-details" data-testid="board-state-details">
      <header className="board-details-head">
        <span className="swatch" style={{ background: chip.color }} aria-hidden="true" />
        <div>
          <h2 className="mono">{chip.label}</h2>
          <div className="chips">
            <span className="chip">state</span>
            {owner && <span className="chip">of {owner.label}</span>}
          </div>
        </div>
      </header>
      {owner?.file && (
        <div className="board-actions">
          <button
            type="button"
            className="chip"
            onClick={() => useViewer.setState({ codeView: { node: null, opened: { ...owner, id: `${owner.id}@${chip.line ?? 0}`, line: chip.line ?? owner.line, endLine: chip.line ?? owner.line } } })}
          >
            <Icon name="code" size={14} /> Read the condition
          </button>
        </div>
      )}
      <p className="description">{chip.description}</p>
      {chip.sub && chip.sub !== 'state' && <p className="muted small mono">{chip.sub}</p>}
      {chip.pins.length > 0 && (
        <Section title={`Elements (${chip.pins.length})`}>
          <ul className="board-list">
            {chip.pins.map((pin) => (
              <li key={pin.id} className="mono small">
                {pin.label}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={`Shows (${shows.length})`}>
        <ul className="board-list">
          {shows.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => useBoard.getState().select(c.id)}>
                {c.label}
                {c.sub && <span className="muted"> {c.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

interface StateGroup {
  label: string
  reads: { name: string; from: string }[]
  line: number
  targets: number[]
  /** Plain elements shown then: `<p.muted> {texts.empty}`. */
  elements: string[]
}

/**
 * What a component shows, grouped by the state it shows it in: "state.status === 'loading'" → the skeleton,
 * "always" → the frame. Pointing at a group lights its children up on the board.
 */
function RenderStates({ bi, scene, node }: { bi: BoardIndex; scene: BoardScene; node: number }) {
  const setFocus = useBoard((s) => s.setFocus)
  const groups = useMemo(() => {
    const byLabel = new Map<string, StateGroup>()
    const groupOf = (c: RenderCase) => {
      const label = caseLabel(c)
      const group = byLabel.get(label) ?? { label, reads: [], line: c.line, targets: [], elements: [] }
      byLabel.set(label, group)
      for (const read of c.reads ?? []) if (!group.reads.some((r) => r.name === read.name)) group.reads.push(read)
      group.line = Math.min(group.line, c.line)
      return group
    }
    const shown = bi.index.nodes[node].attrs?.shows
    for (const element of Array.isArray(shown) ? (shown as ShownElement[]) : []) {
      groupOf(element.case).elements.push(`<${element.tag}${element.className ? `.${element.className}` : ''}>${element.content ? ` ${element.content}` : ''}`)
    }
    for (const e of bi.index.outEdges[node]) {
      const edge = bi.index.edges[e]
      for (const c of renderCases(edge)) {
        const label = caseLabel(c)
        const group = byLabel.get(label) ?? { label, reads: [], line: c.line, targets: [], elements: [] }
        byLabel.set(label, group)
        const target = bi.index.edgeTo[e]
        if (!group.targets.includes(target)) group.targets.push(target)
        for (const read of c.reads ?? []) if (!group.reads.some((r) => r.name === read.name)) group.reads.push(read)
        group.line = Math.min(group.line, c.line)
      }
    }
    // "always" first, then in the order they're written.
    return [...byLabel.values()].sort((a, b) => (a.label === 'always' ? -1 : b.label === 'always' ? 1 : a.line - b.line))
  }, [bi, node])
  if (groups.length === 0) return null
  const onBoard = new Set(scene.chips.map((c) => c.id))
  const target = bi.index.nodes[node]
  return (
    <Section title={`Shows, and when (${groups.length})`}>
      <ul className="board-states" data-testid="board-render-states" onMouseLeave={() => setFocus(null)}>
        {groups.map((group) => (
          <li key={group.label} onMouseEnter={() => setFocus(group.targets)} onFocus={() => setFocus(group.targets)} onBlur={() => setFocus(null)}>
            <button
              type="button"
              className="board-state-when mono"
              title={`Line ${group.line}`}
              onClick={() => useViewer.setState({ codeView: { node: null, opened: { ...target, id: `${target.id}@${group.line}`, line: group.line, endLine: group.line } } })}
            >
              {group.label}
            </button>
            {group.reads.length > 0 && (
              <p className="muted small">
                {group.reads.map((r) => (
                  <span key={r.name} className="board-state-read">
                    <span className="mono">{r.name}</span> ← {r.from}
                  </span>
                ))}
              </p>
            )}
            <ul className="board-list">
              {group.elements.map((element) => (
                <li key={element} className="mono small muted">
                  {element}
                </li>
              ))}
              {group.targets.map((t) => {
                const child = bi.index.nodes[t]
                const chipId = bi.index.nodes[bi.rootOf[t]].id
                return (
                  <li key={t}>
                    <button type="button" onClick={() => (onBoard.has(chipId) ? useBoard.getState().select(chipId) : openAt(bi, t))}>
                      {child.label}
                      <span className="muted"> {bi.index.kinds.get(child.kind)?.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Connections({ title, items }: { title: string; items: { chip: BoardChip; count: number; types: string[] }[] }) {
  return (
    <Section title={`${title} (${items.length})`}>
      <ul className="board-list">
        {items.map(({ chip, count, types }) => (
          <li key={chip.id}>
            <button type="button" onClick={() => useBoard.getState().select(chip.id)}>
              {chip.label}
              <span className="muted">
                {' '}
                {count}× {types.join(', ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="board-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function WireDetails({ bi, scene, wireId }: { bi: BoardIndex; scene: BoardScene; wireId: string }) {
  const wire = scene.wires.find((w) => w.id === wireId)!
  const from = scene.chips.find((c) => c.id === wire.from)
  const to = scene.chips.find((c) => c.id === wire.to)
  return (
    <div className="board-details" data-testid="board-wire-details">
      <h2>
        {from?.label} → {to?.label}
      </h2>
      <p className="muted">
        {wire.count} connection{wire.count === 1 ? '' : 's'}:{' '}
        {Object.entries(wire.types)
          .map(([t, n]) => `${n} ${t}`)
          .join(', ')}
      </p>
      <ul className="board-list">
        {wire.edges.slice(0, 200).map((e) => {
          const edge = bi.index.edges[e]
          const a = bi.index.nodes[bi.index.edgeFrom[e]]
          const b = bi.index.nodes[bi.index.edgeTo[e]]
          const evidence = edge.evidence?.[0]
          const bad = bi.violationsByEdge.get(e)
          return (
            <li key={e} className={bad ? 'bad-text' : undefined}>
              <button
                type="button"
                disabled={!evidence}
                onClick={() => {
                  if (!evidence) return
                  useViewer.setState({ codeView: { node: null, opened: { ...a, id: `${a.id}@${evidence.line ?? 0}`, file: evidence.file, line: evidence.line, endLine: evidence.line } } })
                }}
                title={evidence ? `${evidence.file}:${evidence.line ?? ''}` : undefined}
              >
                {a.label} <span className="muted">{edge.type}</span> {b.label}
                {renderCases(edge).map((c) => (
                  <span key={c.line} className="muted mono small board-wire-when">
                    {' '}
                    · {caseLabel(c)}
                  </span>
                ))}
                {bad && <span className="muted"> · {bad.map((v) => v.rule).join(', ')}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ReviewTab({ bi }: { bi: BoardIndex }) {
  const review = useBoard((s) => s.review)
  const loading = useBoard((s) => s.reviewLoading)
  const error = useBoard((s) => s.reviewError)
  const aiAvailable = useBoard((s) => s.aiAvailable)
  const source = useViewer((s) => s.source)
  const history = useGit((s) => s.history)
  const server = source?.kind === 'server'
  const branches = (history?.refs ?? []).filter((r) => r.type === 'branch').map((r) => r.name)
  const base = history?.repo.defaultBranch ?? (branches.includes('develop') ? 'develop' : branches.includes('main') ? 'main' : branches[0])
  const [choice, setChoice] = useState<string>(server ? WORKTREE : '')
  if (!history) ensureGitHistory()
  const commits = (history?.commits ?? []).slice(0, 40)
  const start = () => {
    if (!choice) return
    if (choice === WORKTREE) void loadReview(bi, undefined, WORKTREE)
    else if (choice.startsWith('branch:')) void loadReview(bi, base, choice.slice(7))
    else if (choice.startsWith('commit:')) {
      const hash = choice.slice(7)
      // A server without the repository (a --graph file) can't diff: the history's file list still can.
      if (server) void loadReview(bi, undefined, hash).then((ok) => !ok && history && reviewCommit(bi, history, hash))
      else if (history) reviewCommit(bi, history, hash)
    }
  }
  const byFeature = useMemo(() => {
    if (!review) return []
    const groups = new Map<string, Set<number>>()
    for (const i of review.touched) {
      const root = bi.rootOf[i]
      const key = `${bi.tierOf[root]}|${bi.featureOf[root]}`
      ;(groups.get(key) ?? groups.set(key, new Set()).get(key)!).add(root)
    }
    return [...groups].sort((a, b) => b[1].size - a[1].size)
  }, [bi, review])
  const options = useBoard((s) => s.options)
  const goTo = (root: number) => {
    if (bi.hidden[root] && !options.showHidden) useBoard.getState().setOption('showHidden', true)
    const landing = landingOf(bi, root, options)
    useBoard.getState().navigate(landing.path, 'in', landing.select)
  }
  return (
    <div className="board-details" data-testid="board-review">
      <h2>Review a change</h2>
      <p className="muted small">See where a change lands on the board, what depends on it, and the tests that cover it.</p>
      <div className="board-review-pick">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Change to review" data-testid="board-review-choice">
          <option value="">Pick a change…</option>
          {server && <option value={WORKTREE}>Uncommitted changes</option>}
          {server && branches.length > 0 && (
            <optgroup label={`Branches against ${base}`}>
              {branches
                .filter((b) => b !== base)
                .map((b) => (
                  <option key={b} value={`branch:${b}`}>
                    {b}
                  </option>
                ))}
            </optgroup>
          )}
          {commits.length > 0 && (
            <optgroup label="Commits">
              {commits.map((c) => (
                <option key={c.hash} value={`commit:${c.hash}`}>
                  {c.hash.slice(0, 7)} {c.subject.slice(0, 60)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button type="button" className="chip solid-accent" onClick={start} disabled={!choice || loading} data-testid="board-review-start">
          {loading ? 'Reading…' : 'Show'}
        </button>
        {review && (
          <button type="button" className="chip" onClick={() => useBoard.getState().setReview(null)}>
            Clear
          </button>
        )}
      </div>
      {error && <p className="bad-text">{error}</p>}
      {review && (
        <>
          <h3 className="board-review-label">{review.label}</h3>
          <p className="muted small">
            {review.files.length} file{review.files.length === 1 ? '' : 's'} · {new Set([...review.touched].map((i) => bi.rootOf[i])).size} chips changed · {review.impacted.size} may be affected · {review.tests.length} tests cover them
            {review.approximate ? ' (whole files: open the repository with npm start for exact lines)' : ''}
          </p>
          {byFeature.map(([key, roots]) => {
            const [tier, feature] = key.split('|')
            return (
              <Section key={key} title={`${featureLabel(bi, feature)} · ${tierLabel(bi, tier)}`}>
                <ul className="board-list">
                  {[...roots].map((root) => (
                    <li key={root}>
                      <button type="button" onClick={() => goTo(root)}>
                        <span className="pill touched" aria-hidden="true" /> {bi.index.nodes[root].label}
                        <span className="muted"> {bi.index.kinds.get(bi.index.nodes[root].kind)?.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )
          })}
          {review.impacted.size > 0 && (
            <Section title={`May be affected (${review.impacted.size})`}>
              <ul className="board-list">
                {[...review.impacted].slice(0, 60).map((root) => (
                  <li key={root}>
                    <button type="button" onClick={() => goTo(root)}>
                      {bi.index.nodes[root].label}
                      <span className="muted"> {featureLabel(bi, bi.featureOf[root])}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {review.tests.length > 0 && (
            <Section title={`Tests to run (${review.tests.length})`}>
              <ul className="board-list">
                {review.tests.map((t) => (
                  <li key={t}>
                    <button type="button" onClick={() => openAt(bi, t)}>
                      {bi.index.nodes[t].label}
                      <span className="muted mono"> {bi.index.nodes[t].file}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="AI briefing">
            {review.briefing?.markdown ? (
              <div className="board-briefing">
                <Markdown text={review.briefing.markdown} />
              </div>
            ) : aiAvailable && !review.approximate ? (
              <>
                <p className="muted small">Claude reads the diff with the map's context and tells you what it does, where it lands, what it can affect, and what to check.</p>
                <button type="button" className="chip solid-accent" onClick={() => void requestBriefing(bi)} disabled={review.briefing?.loading} data-testid="board-briefing">
                  <Icon name="sparkle" size={14} /> {review.briefing?.loading ? 'Writing the briefing…' : 'Brief me'}
                </button>
                {review.briefing?.error && <p className="bad-text">{review.briefing.error}</p>}
              </>
            ) : (
              <p className="muted small">Available when repomap serves your repository on this computer (npm start) with an API key.</p>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

function RulesTab({ bi }: { bi: BoardIndex }) {
  const rules = bi.board.rules ?? []
  const violations = bi.board.violations ?? []
  const aiAvailable = useBoard((s) => s.aiAvailable)
  const options = useBoard((s) => s.options)
  const [suggested, setSuggested] = useState<{ loading: boolean; rules?: unknown[]; error?: string } | null>(null)
  const suggest = async () => {
    setSuggested({ loading: true })
    try {
      const response = await fetch('api/board/suggest-rules', { method: 'POST', headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' }, body: '{}' })
      const data = (await response.json()) as { rules?: unknown[]; error?: string }
      if (!response.ok || !data.rules) throw new Error(data.error ?? `HTTP ${response.status}`)
      setSuggested({ loading: false, rules: data.rules })
    } catch (error) {
      setSuggested({ loading: false, error: (error as Error).message })
    }
  }
  const goTo = (id: string) => {
    const i = bi.index.byId.get(id)
    if (i === undefined) return
    const landing = landingOf(bi, bi.rootOf[i], options)
    useBoard.getState().navigate(landing.path, 'in', landing.select)
  }
  return (
    <div className="board-details" data-testid="board-rules">
      <h2>Architecture rules</h2>
      <p className="muted small">Checked on every build ("rules" in repomap.config.json); npm run check lists them in the terminal. Wires that break one are red.</p>
      {rules.length === 0 && <p>No rules yet.</p>}
      {rules.map((rule) => {
        const broken = violations.filter((v) => v.rule === rule.id)
        return (
          <Section key={rule.id} title={`${broken.length === 0 ? '✓' : (rule.severity ?? 'warn') === 'error' ? '✖' : '!'} ${rule.id}`}>
            <p className="small">{rule.description}</p>
            {broken.length === 0 ? (
              <p className="muted small">Nothing breaks it.</p>
            ) : (
              <ul className="board-list">
                {broken.slice(0, 50).map((v, k) => (
                  <li key={k}>
                    <button type="button" onClick={() => goTo(v.from)} className="bad-text">
                      {v.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )
      })}
      {aiAvailable && (
        <Section title="Suggestions">
          <p className="muted small">Claude proposes rules the code already mostly follows, so new code (yours or an assistant's) keeps to them.</p>
          <button type="button" className="chip solid-accent" onClick={() => void suggest()} disabled={suggested?.loading}>
            <Icon name="sparkle" size={14} /> {suggested?.loading ? 'Thinking…' : 'Suggest rules'}
          </button>
          {suggested?.error && <p className="bad-text">{suggested.error}</p>}
          {suggested?.rules && (
            <>
              <p className="muted small">Copy the ones you want into "rules" in repomap.config.json:</p>
              <pre className="board-code">{JSON.stringify(suggested.rules, null, 2)}</pre>
              <button type="button" className="chip" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(suggested.rules, null, 2))}>
                <Icon name="copy" size={14} /> Copy
              </button>
            </>
          )}
        </Section>
      )}
    </div>
  )
}

function AiTab({ bi }: { bi: BoardIndex }) {
  const job = useBoard((s) => s.ai)
  const aiAvailable = useBoard((s) => s.aiAvailable)
  const [error, setError] = useState<string | null>(null)
  const summaries = bi.board.summaries ?? {}
  const total = Object.keys(summaries).length
  const stale = Object.values(summaries).filter((s) => s.stale).length
  const run = async (limit?: number) => {
    setError(null)
    const response = await fetch('api/board/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' }, body: JSON.stringify({ limit }) })
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) setError(data.error ?? `HTTP ${response.status}`)
    else useBoard.getState().setAi(data as never)
  }
  const stop = () => void fetch('api/board/stop', { method: 'POST', headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' }, body: '{}' })
  const phaseLabel: Record<string, string> = { place: 'Placing chips in features', chips: 'Summarizing chips', features: 'Summarizing features', tiers: 'Summarizing tiers and the app', done: 'Done' }
  return (
    <div className="board-details" data-testid="board-ai">
      <h2>AI summaries</h2>
      <p className="muted small">
        Claude reads each chip's code and writes what it does, then sums up each feature, tier and the app from those. They are kept in repomap.ai.json with a hash of the code they read, so a run only redoes what
        changed, and a summary whose code moved on is marked.
      </p>
      <p>
        {total} summaries{stale ? `, ${stale} out of date` : ''}.
      </p>
      {aiAvailable ? (
        job?.running ? (
          <>
            <p>
              {phaseLabel[job.progress?.phase ?? 'chips'] ?? job.progress?.phase}… {job.progress ? `${job.progress.done}/${job.progress.total}` : ''}
            </p>
            <progress max={job.progress?.total || 1} value={job.progress?.done ?? 0} aria-label="Progress" />
            <button type="button" className="chip" onClick={stop}>
              <Icon name="stop" size={14} /> Stop
            </button>
          </>
        ) : (
          <div className="board-actions">
            <button type="button" className="chip solid-accent" onClick={() => void run()} data-testid="board-summarize">
              <Icon name="sparkle" size={14} /> Write what's missing
            </button>
            <button type="button" className="chip" onClick={() => void run(50)}>
              Just 50 chips
            </button>
          </div>
        )
      ) : (
        <p className="muted small">Run npm run summarize in tools/repomap (through Claude Code or an API key, as Settings say), or open the board with npm start on this computer.</p>
      )}
      {job?.result && !job.running && (
        <p className="small">
          Last run: {job.result.written} written, {job.result.placed} chips placed in features{job.result.failed ? `, ${job.result.failed} failed` : ''}
          {job.result.remaining ? `, ${job.result.remaining} chips left for the next run` : ''}.
        </p>
      )}
      {(job?.error || error) && <p className="bad-text">{job?.error ?? error}</p>}
    </div>
  )
}
