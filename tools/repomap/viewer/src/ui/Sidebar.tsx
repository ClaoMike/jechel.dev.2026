import { useState, type MouseEvent, type ReactNode } from 'react'
import type { Visibility } from '../../../src/shared/types.ts'
import { kindKey, type Count } from '../model/filters.ts'
import { useViewer } from '../model/store.ts'
import { Explorer } from './Explorer.tsx'
import { EdgeIcon, Icon, ShapeIcon } from './icons.tsx'

type Facet = 'layers' | 'kinds' | 'roles' | 'edgeTypes' | 'sources'

interface RowProps {
  label: string
  title?: string
  icon?: ReactNode
  count?: Count
  value: Visibility
  /** Shown as partially checked (some children hidden/dimmed). */
  mixed?: boolean
  depth?: number
  expanded?: boolean
  onExpand?: () => void
  onChange: (value: Visibility) => void
  onSolo?: () => void
  testId?: string
}

/**
 * One filter row: checkbox = show/hide, the half-moon button = dim instead of hide (per row),
 * ⌥/Alt-click = solo (only this one in its group).
 */
function FacetRow({ label, title, icon, count, value, mixed, depth = 0, expanded, onExpand, onChange, onSolo, testId }: RowProps) {
  const checked = value !== 'hide'
  const toggle = (event: MouseEvent) => {
    if (event.altKey && onSolo) onSolo()
    else onChange(checked ? 'hide' : 'show')
  }
  const empty = count !== undefined && count.total === 0
  return (
    <div className={`facet-row depth-${depth} ${value}${empty ? ' empty' : ''}`} title={title} data-testid={testId}>
      {onExpand ? (
        <button type="button" className={`expander${expanded ? ' open' : ''}`} onClick={onExpand} aria-label={expanded ? 'Collapse' : 'Expand'}>
          <Icon name="chevron" size={12} />
        </button>
      ) : (
        <span className="expander-space" />
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={mixed && checked ? 'mixed' : checked}
        className={`check${checked ? ' on' : ''}${mixed && checked ? ' mixed' : ''}`}
        onClick={toggle}
        aria-label={`Show ${label}`}
      />
      <button type="button" className="facet-label" onClick={toggle}>
        {icon}
        <span className="facet-text">{label}</span>
      </button>
      {count && (
        <span className="facet-count" title={`${count.shown} of ${count.total} shown`}>
          {count.shown === count.total ? count.total : `${count.shown}/${count.total}`}
        </span>
      )}
      <button
        type="button"
        className={`dim-toggle${value === 'dim' ? ' active' : ''}`}
        onClick={() => onChange(value === 'dim' ? 'show' : 'dim')}
        title={value === 'dim' ? 'Dimmed — click to show normally' : 'Dim instead of hide (keep as faint context)'}
        aria-label={`Dim ${label}`}
        disabled={value === 'hide'}
      >
        <Icon name="dim" size={13} />
      </button>
    </div>
  )
}

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`side-section${open ? ' open' : ''}`}>
      <header>
        <button type="button" className="section-toggle" onClick={() => setOpen(!open)}>
          <Icon name="chevron" size={12} />
          <span>{title}</span>
        </button>
        {aside}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}

export function Sidebar() {
  const index = useViewer((s) => s.index)
  const filters = useViewer((s) => s.filters)
  const counts = useViewer((s) => s.counts)
  const presetId = useViewer((s) => s.presetId)
  const open = useViewer((s) => s.sidebarOpen)
  const showChanges = useViewer((s) => s.showChanges)
  const { applyPreset, setFacet, setFacetMany, setOption, setMinConfidence, setShowChanges } = useViewer.getState()
  const [view, setViewState] = useState<'filters' | 'files'>(() => {
    try {
      return localStorage.getItem('repomap.sidebar') === 'files' ? 'files' : 'filters'
    } catch {
      return 'filters'
    }
  })
  const setView = (next: 'filters' | 'files') => {
    setViewState(next)
    try {
      localStorage.setItem('repomap.sidebar', next)
    } catch {
      // not remembered
    }
  }
  const [expanded, setExpandedState] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('repomap.expanded') ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })
  const setExpanded = (next: Record<string, boolean>) => {
    setExpandedState(next)
    try {
      localStorage.setItem('repomap.expanded', JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  if (!index || !counts) return <aside className={`sidebar${open ? ' open' : ''}`} />

  const value = (facet: Facet, key: string): Visibility => filters[facet][key] ?? 'show'
  const solo = (facet: Facet, key: string, keys: string[]) =>
    setFacetMany(facet, Object.fromEntries(keys.map((k) => [k, k === key ? 'show' : 'hide'])))

  const layerIds = index.layers.filter((l) => counts.layers.has(l.id)).map((l) => l.id)
  const rolesPresent = [...index.roles.values()].filter((r) => (counts.roles.get(r.id)?.total ?? 0) > 0)
  const topRoles = rolesPresent.filter((r) => !r.parent || !rolesPresent.some((p) => p.id === r.parent))
  const changes = index.graph.meta.changes

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} data-testid="sidebar" aria-label={view === 'files' ? 'Files' : 'Filters'}>
      <div className="drawer-header narrow-only">
        <strong>{view === 'files' ? 'Files' : 'Filters'}</strong>
        <button type="button" className="icon-button" onClick={() => useViewer.getState().setSidebar(false)} aria-label="Close filters">
          <Icon name="close" />
        </button>
      </div>
      <div className="sidebar-tabs segmented" role="group" aria-label="Side panel">
        <button type="button" className={view === 'filters' ? 'active' : ''} aria-pressed={view === 'filters'} onClick={() => setView('filters')} data-testid="sidebar-filters">
          <Icon name="dim" size={14} /> Filters
        </button>
        <button type="button" className={view === 'files' ? 'active' : ''} aria-pressed={view === 'files'} onClick={() => setView('files')} data-testid="sidebar-files">
          <Icon name="file" size={14} /> Files
        </button>
      </div>
      {view === 'files' ? (
        <div className="sidebar-scroll">
          <Explorer />
        </div>
      ) : (
        <>
        <div className="sidebar-scroll">
          <Section title="Presets">
            <div className="presets">
              {index.graph.meta.presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={`chip${presetId === preset.id ? ' active' : ''}`}
                  title={preset.description}
                  onClick={() => applyPreset(preset.id)}
                  data-testid={`preset-${preset.id}`}
                >
                  {preset.label}
                </button>
              ))}
              {!presetId && <span className="chip custom">Custom</span>}
            </div>
          </Section>

          <Section title="Layers & kinds">
            {layerIds.map((layerId) => {
              const layer = index.layerById.get(layerId)!
              const kinds = index.layerKinds.get(layerId) ?? []
              const kindValues = kinds.map((k) => value('kinds', kindKey(layerId, k)))
              return (
                <div key={layerId} className="facet-group">
                  <FacetRow
                    label={layer.label}
                    title={layer.description}
                    icon={<span className="swatch" style={{ background: layer.color }} />}
                    count={counts.layers.get(layerId)}
                    value={value('layers', layerId)}
                    mixed={kindValues.some((v) => v !== 'show')}
                    expanded={!!expanded[layerId]}
                    onExpand={() => setExpanded({ ...expanded, [layerId]: !expanded[layerId] })}
                    onChange={(v) => setFacet('layers', layerId, v)}
                    onSolo={() => solo('layers', layerId, layerIds)}
                    testId={`layer-${layerId}`}
                  />
                  {expanded[layerId] &&
                    kinds.map((kindId) => {
                      const kind = index.kinds.get(kindId)!
                      const key = kindKey(layerId, kindId)
                      return (
                        <FacetRow
                          key={key}
                          depth={1}
                          label={kind.label}
                          title={kind.description}
                          icon={<ShapeIcon shape={kind.shape} color={kind.color} />}
                          count={counts.kinds.get(key)}
                          value={value('kinds', key)}
                          onChange={(v) => setFacet('kinds', key, v)}
                          onSolo={() => solo('kinds', key, kinds.map((k) => kindKey(layerId, k)))}
                          testId={`kind-${key}`}
                        />
                      )
                    })}
                </div>
              )
            })}
          </Section>

          <Section title="Roles">
            {topRoles.map((role) => {
              const children = rolesPresent.filter((r) => r.parent === role.id)
              return (
                <div key={role.id} className="facet-group">
                  <FacetRow
                    label={role.label}
                    title={role.description}
                    icon={<span className={`swatch${role.style === 'ghost' ? ' ghost' : ''}`} style={{ background: role.color }} />}
                    count={counts.roles.get(role.id)}
                    value={value('roles', role.id)}
                    mixed={children.some((c) => value('roles', c.id) !== 'show')}
                    expanded={children.length > 0 ? !!expanded[`role:${role.id}`] : undefined}
                    onExpand={children.length > 0 ? () => setExpanded({ ...expanded, [`role:${role.id}`]: !expanded[`role:${role.id}`] }) : undefined}
                    onChange={(v) => setFacet('roles', role.id, v)}
                    onSolo={() => solo('roles', role.id, topRoles.map((r) => r.id))}
                    testId={`role-${role.id}`}
                  />
                  {expanded[`role:${role.id}`] &&
                    children.map((child) => (
                      <FacetRow
                        key={child.id}
                        depth={1}
                        label={child.label}
                        title={child.description}
                        icon={<span className="swatch" style={{ background: child.color }} />}
                        count={counts.roles.get(child.id)}
                        value={value('roles', child.id)}
                        onChange={(v) => setFacet('roles', child.id, v)}
                        onSolo={() => solo('roles', child.id, children.map((c) => c.id))}
                        testId={`role-${child.id}`}
                      />
                    ))}
                </div>
              )
            })}
          </Section>

          <Section title="Edges" defaultOpen={false}>
            {index.presentEdgeTypes.map((typeId) => {
              const type = index.edgeTypes.get(typeId)!
              return (
                <FacetRow
                  key={typeId}
                  label={type.label}
                  title={type.description}
                  icon={<EdgeIcon color={type.color} />}
                  count={counts.edgeTypes.get(typeId)}
                  value={value('edgeTypes', typeId)}
                  onChange={(v) => setFacet('edgeTypes', typeId, v)}
                  onSolo={() => solo('edgeTypes', typeId, index.presentEdgeTypes)}
                  testId={`edge-${typeId}`}
                />
              )
            })}
            <div className="subhead">Source</div>
            {['static', 'llm', 'manual']
              .filter((source) => (counts.sources.get(source)?.total ?? 0) > 0)
              .map((source) => (
                <FacetRow
                  key={source}
                  label={source === 'static' ? 'Static analysis' : source === 'llm' ? 'LLM-inferred' : 'Manual'}
                  icon={<span className={`swatch line ${source}`} />}
                  count={counts.sources.get(source)}
                  value={value('sources', source)}
                  onChange={(v) => setFacet('sources', source, v)}
                />
              ))}
            <label className="slider">
              <span>Min. confidence</span>
              <input type="range" min={0} max={1} step={0.05} value={filters.minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} />
              <output>{filters.minConfidence.toFixed(2)}</output>
            </label>
          </Section>

          <Section title="Display" defaultOpen={false}>
            <Toggle label="Roll up edges of hidden children" hint="Hiding columns keeps foreign keys as table → table" checked={filters.rollUp} onChange={(v) => setOption('rollUp', v)} />
            <Toggle label="Hide nodes without visible edges" checked={filters.hideOrphans} onChange={(v) => setOption('hideOrphans', v)} />
            <Toggle
              label={`Show unresolved links (${index.graph.unresolved.length})`}
              hint="Calls to routes that don't exist, in red"
              checked={filters.showUnresolved}
              onChange={(v) => setOption('showUnresolved', v)}
            />
            {changes && (
              <Toggle
                label={`Highlight changes (+${changes.addedNodes.length} / −${changes.removedNodes.length})`}
                hint={`Nodes added since the build of ${new Date(changes.since).toLocaleString()}`}
                checked={showChanges}
                onChange={setShowChanges}
              />
            )}
          </Section>
        </div>
        <footer className="sidebar-footer">
          <span>
            <strong>{counts.nodesShown}</strong>/{index.nodes.length} nodes
          </span>
          <span>
            <strong>{counts.edgesShown}</strong>/{index.edges.length} edges
          </span>
          <button type="button" className="link-button" onClick={() => applyPreset('everything')} title="Show everything">
            <Icon name="reset" size={13} /> Reset
          </button>
        </footer>
        </>
      )}
    </aside>
  )

}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-label">{label}</span>
    </label>
  )
}
