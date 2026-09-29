import { useMemo, useState } from 'react'
import type { GraphIndex } from '../model/graph.ts'
import { useViewer } from '../model/store.ts'
import { traceByLayer } from '../model/trace.ts'
import { Icon, ShapeIcon } from './icons.tsx'

export function DetailsPanel() {
  const index = useViewer((s) => s.index)
  const selected = useViewer((s) => s.selected)
  const trace = useViewer((s) => s.trace)
  const traceTests = useViewer((s) => s.traceTests)
  const { select, setTraceTests } = useViewer.getState()

  if (!index || selected === null) return null
  const node = index.nodes[selected]
  const kind = index.kinds.get(node.kind)!
  const layer = index.layerById.get(node.layer)
  const role = index.roles.get(node.role)
  const root = index.graph.meta.repo.root
  const editorHref = root && node.file ? `vscode://file/${encodeURI(`${root}/${node.file}`)}${node.line ? `:${node.line}` : ''}` : null
  const unresolved = index.unresolvedByNode.get(selected) ?? []

  return (
    <aside className="details" data-testid="details">
      <header className="details-header">
        <ShapeIcon shape={kind.shape} color={kind.color} size={20} />
        <div className="details-title">
          <h2 title={node.label}>{node.label}</h2>
          <div className="chips">
            <span className="chip solid" style={{ ['--chip-color' as string]: kind.color }}>{kind.label}</span>
            {layer && <span className="chip solid" style={{ ['--chip-color' as string]: layer.color }}>{layer.label}</span>}
            {role && (
              <span className="chip solid" style={{ ['--chip-color' as string]: role.color }} title={node.roleReason ? `Why: ${node.roleReason}` : undefined}>
                {role.parent ? `${index.roles.get(role.parent)?.label ?? role.parent} · ${role.label}` : role.label}
              </span>
            )}
          </div>
        </div>
        <button type="button" className="icon-button" onClick={() => select(null)} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>

      <div className="details-scroll">
        {node.description && (
          <p className="description">
            {node.description}
            {node.descriptionSource && node.descriptionSource !== 'doc-comment' && <span className="source-tag">{node.descriptionSource}</span>}
          </p>
        )}

        {node.file && (
          <div className="location">
            <code title={node.file}>
              {node.file}
              {node.line ? `:${node.line}` : ''}
            </code>
            <div className="location-actions">
              {editorHref && (
                <a className="link-button" href={editorHref} title="Open in VS Code">
                  <Icon name="external" size={13} /> Open
                </a>
              )}
              <button type="button" className="link-button" onClick={() => void navigator.clipboard?.writeText(`${node.file}${node.line ? `:${node.line}` : ''}`)} title="Copy path">
                <Icon name="copy" size={13} /> Copy
              </button>
            </div>
          </div>
        )}

        <Attributes attrs={node.attrs} />

        {node.roleReason && (
          <div className="why">
            <span>Role</span> {node.roleReason}
          </div>
        )}

        {unresolved.length > 0 && (
          <section className="detail-section">
            <h3 className="danger">
              <Icon name="warn" size={14} /> Unresolved ({unresolved.length})
            </h3>
            <ul className="plain">
              {unresolved.map((link, k) => (
                <li key={k} className="unresolved">
                  <code>{link.target}</code>
                  <span>{link.reason}</span>
                  {link.evidence?.[0] && (
                    <span className="evidence">
                      {link.evidence[0].file}:{link.evidence[0].line}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {trace && (
          <section className="detail-section">
            <h3>
              Trace
              <span className="trace-counts">
                <Icon name="up" size={12} /> {trace.up} <Icon name="down" size={12} /> {trace.down}
              </span>
              <label className="mini-toggle" title="Also follow tests and mocks one hop">
                <input type="checkbox" checked={traceTests} onChange={(e) => setTraceTests(e.target.checked)} /> tests
              </label>
            </h3>
            <TraceList index={index} />
          </section>
        )}

        <Connections index={index} i={selected} />
      </div>
    </aside>
  )
}

function Attributes({ attrs }: { attrs?: Record<string, unknown> }) {
  if (!attrs) return null
  const entries = Object.entries(attrs).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (entries.length === 0) return null
  return (
    <dl className="attrs">
      {entries.map(([key, value]) => (
        <div key={key} className="attr">
          <dt>{humanize(key)}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function formatValue(value: unknown): React.ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">none</span>
    if (value.length > 3 || value.some((v) => String(v).length > 24)) {
      return (
        <ul className="attr-list">
          {value.slice(0, 40).map((v, k) => (
            <li key={k}>{String(v)}</li>
          ))}
          {value.length > 40 && <li className="muted">… {value.length - 40} more</li>}
        </ul>
      )
    }
    return value.map(String).join(', ')
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'object') return <code>{JSON.stringify(value)}</code>
  return String(value)
}

function humanize(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

function TraceList({ index }: { index: GraphIndex }) {
  const trace = useViewer((s) => s.trace)
  const selected = useViewer((s) => s.selected)
  const select = useViewer((s) => s.select)
  const groups = useMemo(() => (trace ? traceByLayer(index, trace) : []), [index, trace])
  if (!trace) return null
  return (
    <div className="trace-list">
      {groups.map((group) => {
        const layer = index.layerById.get(group.layer)
        return (
          <div key={group.layer} className="trace-group">
            <div className="trace-layer" style={{ color: layer?.color }}>
              {layer?.label ?? group.layer} <span className="muted">{group.items.length}</span>
            </div>
            <ul className="plain">
              {group.items.slice(0, 60).map(({ i, node: member }) => {
                const node = index.nodes[i]
                const kind = index.kinds.get(node.kind)!
                return (
                  <li key={i}>
                    <button type="button" className={`node-link ${member.role}${i === selected ? ' current' : ''}`} onClick={() => select(i)} title={`${kind.label} · ${member.role}`}>
                      <span className={`dir ${member.role}`}>{member.role === 'up' ? '↑' : member.role === 'down' ? '↓' : member.role === 'root' ? '●' : '·'}</span>
                      <ShapeIcon shape={kind.shape} color={kind.color} size={12} />
                      <span className="node-link-label">{node.label}</span>
                    </button>
                  </li>
                )
              })}
              {group.items.length > 60 && <li className="muted">… {group.items.length - 60} more</li>}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function Connections({ index, i }: { index: GraphIndex; i: number }) {
  const select = useViewer((s) => s.select)
  const [showAll, setShowAll] = useState(false)
  const groups = useMemo(() => {
    const result: { direction: 'out' | 'in'; type: string; items: { j: number; confidence: number }[] }[] = []
    for (const direction of ['out', 'in'] as const) {
      const byType = new Map<string, { j: number; confidence: number }[]>()
      for (const e of direction === 'out' ? index.outEdges[i] : index.inEdges[i]) {
        const edge = index.edges[e]
        const j = direction === 'out' ? index.edgeTo[e] : index.edgeFrom[e]
        if (!byType.has(edge.type)) byType.set(edge.type, [])
        byType.get(edge.type)!.push({ j, confidence: edge.confidence })
      }
      for (const [type, items] of byType) result.push({ direction, type, items })
    }
    return result
  }, [index, i])
  if (groups.length === 0) return null
  return (
    <section className="detail-section">
      <h3>Connections</h3>
      {groups.map((group) => {
        const type = index.edgeTypes.get(group.type)
        const items = showAll ? group.items : group.items.slice(0, 12)
        return (
          <div key={`${group.direction}-${group.type}`} className="connection-group">
            <div className="connection-head">
              <span className="edge-swatch" style={{ background: type?.color }} />
              {group.direction === 'out' ? type?.label ?? group.type : `${type?.label ?? group.type} (incoming)`}
              <span className="muted">{group.items.length}</span>
            </div>
            <ul className="plain">
              {items.map(({ j, confidence }) => {
                const node = index.nodes[j]
                const kind = index.kinds.get(node.kind)!
                return (
                  <li key={j}>
                    <button type="button" className="node-link" onClick={() => select(j)} title={node.id}>
                      <span className="dir">{group.direction === 'out' ? '→' : '←'}</span>
                      <ShapeIcon shape={kind.shape} color={kind.color} size={12} />
                      <span className="node-link-label">{node.label}</span>
                      {confidence < 1 && <span className="confidence">{Math.round(confidence * 100)}%</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            {group.items.length > 12 && !showAll && (
              <button type="button" className="link-button" onClick={() => setShowAll(true)}>
                show all {group.items.length}
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}
