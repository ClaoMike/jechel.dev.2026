/**
 * The Board's levels, as plain data: which chips a level shows, their pins, the wires between them
 * (edges rolled up) and the connectors to what lies off the board. Pure: rendering and layout only
 * read what `buildScene` returns.
 *
 *   app → tiers → a tier's features → a feature's chips (or, when there are many, its folders first) → one chip
 */
import {
  assignFeatures,
  BOARD_HIDDEN_ROLES,
  featureDefs,
  resolveTiers,
  type FeatureSource,
  caseLabel,
  featureKey,
  isConditional,
  renderCases,
  memberAt,
  membersOf,
  roleCovers,
  SHARED_FEATURE,
  summaryKey,
  type BoardData,
  type FeatureDef,
  type Member,
  type Summary,
  type TierDef,
  type Violation,
} from '../../../src/shared/board.ts'
import { edgeKey, type RenderCase, type ShownElement } from '../../../src/shared/types.ts'
import type { GraphIndex } from '../model/graph.ts'

export type BoardPath =
  | { level: 'app' }
  | { level: 'tiers' }
  | { level: 'features'; tier: string }
  | { level: 'chips'; tier: string; feature: string; group?: string }
  | { level: 'chip'; tier: string; feature: string; group?: string; chip: string }

/** `state`: a state a component is in (`state.status === 'loading'`), between it and the children it shows then. */
export type ChipKind = 'app' | 'tier' | 'feature' | 'group' | 'node' | 'connector' | 'state'

export interface BoardPin {
  id: string
  label: string
  /** A child node's kind, or a member's (function, prop, state…). */
  kind: string
  node?: number
  member?: Member
  /** Wires end here (west side) / start here (east side). */
  in: boolean
  out: boolean
}

export interface BoardChip {
  id: string
  label: string
  sub?: string
  kind: ChipKind
  color: string
  pins: BoardPin[]
  /** Pins left out at this level. */
  morePins?: number
  /** How many chips it holds (tiers, features, folders). */
  count?: number
  /** Drawn faded: a shared chip only partly in this feature. */
  ghost?: boolean
  /** Where zooming into it goes. */
  enter?: BoardPath
  node?: number
  summary?: Summary
  description?: string
  /** Column (ELK partition): the layer within a tier. */
  partition?: number
  /** State chips: the component (node index) whose state it is, and where in its code the condition is. */
  owner?: number
  line?: number
  /** Connectors: wires come in from (left) or go out to (right) it. */
  side?: 'in' | 'out'
  touched: number
  impacted: number
  violations: number
  /** Features on a tier chip, for its colour bar. */
  palette?: { color: string; weight: number }[]
}

export interface BoardWire {
  id: string
  from: string
  to: string
  fromPin?: string
  toPin?: string
  count: number
  types: Record<string, number>
  /** Edge indices (GraphIndex) rolled into it. */
  edges: number[]
  violation: boolean
  touched: boolean
  /** Every connection is a render that happens only under some condition (drawn dashed). */
  conditional: boolean
}

export interface BoardScene {
  path: BoardPath
  direction: 'RIGHT' | 'DOWN'
  chips: BoardChip[]
  wires: BoardWire[]
  /** Chips the level left out (too many connectors…). */
  note?: string
}

export interface BoardOptions {
  /** Tests, config, migrations, generated code, tooling and docs. */
  showHidden: boolean
  /** `uses-type` edges (type references). */
  typeLinks: boolean
  /** A component's states as chips between it and what it shows in each (on unless false). */
  states?: boolean
}

export interface ReviewMarks {
  touched: Set<number>
  impacted: Set<number>
}

/** Folders shown first when a feature has more chips than this on a tier. */
export const MAX_CHIPS = 40
const MAX_PINS = 10
const MAX_CONNECTORS = 16
const NEVER_WIRED = new Set(['contains'])
/** Chips from other features a feature's board shows because its components render them. */
const MAX_BORROWED = 12

/** Lookups the levels share, computed once per graph. */
export interface BoardIndex {
  index: GraphIndex
  board: BoardData
  tiers: TierDef[]
  tierById: Map<string, TierDef>
  features: FeatureDef[]
  featureById: Map<string, FeatureDef>
  /** Per node: tier id, feature id, root chip (node index), position of its layer in the tier. */
  tierOf: string[]
  featureOf: string[]
  rootOf: Int32Array
  /** Per node: the root's direct child it lies under (itself for direct children and roots). */
  pinOf: Int32Array
  partitionOf: Int16Array
  hidden: Uint8Array
  violationsByEdge: Map<number, Violation[]>
  violationsByNode: Map<number, number>
}

/** A board for a graph built without one (an older build, a dropped file, the demo): a tier per layer, features from tags and neighbours. */
function deriveBoard(index: GraphIndex): { board: BoardData; features: Map<string, { feature: string; source: FeatureSource }> } {
  const features = assignFeatures(index.nodes, index.edges)
  return {
    board: { tiers: resolveTiers(index.layers, undefined), features: featureDefs([...features.values()].map((f) => f.feature)) },
    features,
  }
}

export function indexBoard(index: GraphIndex): BoardIndex {
  const derived = index.graph.board ? null : deriveBoard(index)
  const board = index.graph.board ?? derived!.board
  const n = index.nodes.length
  const tierById = new Map(board.tiers.map((t) => [t.id, t]))
  const tierOfLayer = new Map<string, { tier: string; position: number }>()
  for (const tier of board.tiers) tier.layers.forEach((layer, position) => tierOfLayer.set(layer, { tier: tier.id, position }))
  const tierOf: string[] = new Array(n)
  const featureOf: string[] = new Array(n)
  const rootOf = new Int32Array(n)
  const pinOf = new Int32Array(n)
  const partitionOf = new Int16Array(n)
  const hidden = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const node = index.nodes[i]
    const placed = tierOfLayer.get(node.layer)
    tierOf[i] = placed?.tier ?? node.layer
    partitionOf[i] = placed?.position ?? 0
    featureOf[i] = node.feature ?? derived?.features.get(node.id)?.feature ?? SHARED_FEATURE
    let root = i
    let pin = i
    let guard = 0
    while (index.parent[root] >= 0 && guard++ < 50) {
      pin = root
      root = index.parent[root]
    }
    rootOf[i] = root
    pinOf[i] = pin
    hidden[i] = roleCovers(BOARD_HIDDEN_ROLES, node.role) ? 1 : 0
  }
  // A child of a hidden node is hidden; a node's feature defaults to its root's.
  for (let i = 0; i < n; i++) if (hidden[rootOf[i]]) hidden[i] = 1
  const edgeIndex = new Map<string, number>()
  index.edges.forEach((edge, e) => edgeIndex.set(edgeKey(edge), e))
  const violationsByEdge = new Map<number, Violation[]>()
  const violationsByNode = new Map<number, number>()
  for (const violation of board.violations ?? []) {
    const e = edgeIndex.get(edgeKey(violation))
    if (e === undefined) continue
    if (!violationsByEdge.has(e)) violationsByEdge.set(e, [])
    violationsByEdge.get(e)!.push(violation)
    // Counted where the offending edge starts (once per violation).
    const from = index.edgeFrom[e]
    violationsByNode.set(from, (violationsByNode.get(from) ?? 0) + 1)
  }
  return {
    index,
    board,
    tiers: board.tiers,
    tierById,
    features: board.features,
    featureById: new Map(board.features.map((f) => [f.id, f])),
    tierOf,
    featureOf,
    rootOf,
    pinOf,
    partitionOf,
    hidden,
    violationsByEdge,
    violationsByNode,
  }
}

export function featureLabel(bi: BoardIndex, feature: string): string {
  return bi.featureById.get(feature)?.label ?? feature
}

export function tierLabel(bi: BoardIndex, tier: string): string {
  return bi.tierById.get(tier)?.label ?? tier
}

/** Breadcrumb labels for a path. */
export function pathTrail(bi: BoardIndex, path: BoardPath, appName: string): { label: string; path: BoardPath }[] {
  const trail: { label: string; path: BoardPath }[] = [{ label: appName, path: { level: 'app' } }]
  if (path.level === 'app') return trail
  trail.push({ label: 'Tiers', path: { level: 'tiers' } })
  if (path.level === 'tiers') return trail
  trail.push({ label: tierLabel(bi, path.tier), path: { level: 'features', tier: path.tier } })
  if (path.level === 'features') return trail
  trail.push({ label: featureLabel(bi, path.feature), path: { level: 'chips', tier: path.tier, feature: path.feature } })
  if (path.group) trail.push({ label: path.group, path: { level: 'chips', tier: path.tier, feature: path.feature, group: path.group } })
  if (path.level === 'chip') {
    const i = bi.index.byId.get(path.chip)
    trail.push({ label: i === undefined ? path.chip : bi.index.nodes[i].label, path })
  }
  return trail
}

/** The level above. */
export function parentPath(path: BoardPath): BoardPath | null {
  switch (path.level) {
    case 'app':
      return null
    case 'tiers':
      return { level: 'app' }
    case 'features':
      return { level: 'tiers' }
    case 'chips':
      return path.group ? { level: 'chips', tier: path.tier, feature: path.feature } : { level: 'features', tier: path.tier }
    case 'chip':
      return { level: 'chips', tier: path.tier, feature: path.feature, group: path.group }
  }
}

/**
 * Where to show a node: its feature's board with its chip selected, or, when the chip is deeper than that board shows
 * (rendered by a component under the feature's top ones), its own board.
 */
export function landingOf(bi: BoardIndex, i: number, options: BoardOptions): { path: BoardPath; select: string } {
  const root = bi.rootOf[i]
  const path = pathOfNode(bi, root, options) as Extract<BoardPath, { level: 'chip' }>
  const id = bi.index.nodes[root].id
  const opts = { ...options, showHidden: options.showHidden || !!bi.hidden[root] }
  const all = chipsIn(bi, path.tier, path.feature, opts)
  const groups = grouped(bi, all, path.feature, path.tier, opts)
  const { own } = renderLevels(bi, groups ? all.filter((c) => groups.get(c) === path.group) : all, path.tier, opts)
  if (!own.includes(root)) return { path, select: id }
  return { path: { level: 'chips', tier: path.tier, feature: path.feature, ...(path.group !== undefined ? { group: path.group } : {}) }, select: id }
}

export function samePath(a: BoardPath, b: BoardPath): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function visible(bi: BoardIndex, i: number, options: BoardOptions): boolean {
  return options.showHidden || !bi.hidden[i]
}

function wired(bi: BoardIndex, e: number, options: BoardOptions): boolean {
  const type = bi.index.edges[e].type
  if (NEVER_WIRED.has(type)) return false
  if (type === 'uses-type' && !options.typeLinks) return false
  return true
}

/** Root chips on a tier with something (themselves or a child) in a feature. */
export function chipsIn(bi: BoardIndex, tier: string, feature: string, options: BoardOptions): number[] {
  const roots = new Set<number>()
  for (let i = 0; i < bi.index.nodes.length; i++) {
    if (bi.tierOf[i] !== tier || bi.featureOf[i] !== feature || !visible(bi, i, options)) continue
    roots.add(bi.rootOf[i])
  }
  return [...roots].sort((a, b) => bi.index.nodes[a].label.localeCompare(bi.index.nodes[b].label))
}

/**
 * A folder for each chip, to show a big feature in parts: inside the feature's own folder
 * (features/about/Experience → "Experience"), else below the folder they all share; a folder holding
 * most chips is split one level further.
 */
export function chipGroups(bi: BoardIndex, chips: number[], feature?: string): Map<number, string> {
  const dirs = new Map<number, string[]>()
  for (const c of chips) {
    const node = bi.index.nodes[c]
    if (!node.file) continue
    const parts = node.file.split('/').slice(0, -1)
    const at = feature ? parts.findIndex((p) => featureKey(p) === feature) : -1
    dirs.set(c, at >= 0 ? ['@', ...parts.slice(at + 1)] : parts)
  }
  // The folder the others share (the feature's own folder counts as one, "@").
  const others = [...dirs.values()].filter((d) => d[0] !== '@')
  let common = others[0] ?? []
  for (const dir of others) {
    let k = 0
    while (k < common.length && k < dir.length && common[k] === dir[k]) k++
    common = common.slice(0, k)
  }
  const keyOf = (dir: string[], depth: number) => {
    const rest = dir[0] === '@' ? dir.slice(1) : dir.slice(common.length)
    return rest.slice(0, depth).join('/') || (dir[0] === '@' ? '(feature folder)' : '(top folder)')
  }
  const depth = new Map<number, number>()
  for (const c of dirs.keys()) depth.set(c, 1)
  for (let round = 0; round < 3; round++) {
    const sizes = new Map<string, number[]>()
    for (const [c, dir] of dirs) (sizes.get(keyOf(dir, depth.get(c)!)) ?? sizes.set(keyOf(dir, depth.get(c)!), []).get(keyOf(dir, depth.get(c)!))!).push(c)
    const big = [...sizes.values()].find((members) => members.length > Math.max(MAX_CHIPS, chips.length * 0.6) && members.some((c) => keyOf(dirs.get(c)!, depth.get(c)! + 1) !== keyOf(dirs.get(c)!, depth.get(c)!)))
    if (!big) break
    for (const c of big) depth.set(c, depth.get(c)! + 1)
  }
  const groups = new Map<number, string>()
  for (const c of chips) {
    const dir = dirs.get(c)
    groups.set(c, dir ? keyOf(dir, depth.get(c)!) : bi.index.nodes[c].kind)
  }
  return groups
}

/** Whether a feature's chips on a tier are shown as folders first. */
/**
 * A feature's folders, when its board would show too many chips: counted as the board shows them (its top components
 * and what they render, not what those render in turn), so a feature with one page opens on that page.
 */
function grouped(bi: BoardIndex, chips: number[], feature: string, tier: string, options: BoardOptions): Map<number, string> | null {
  if (chips.length <= MAX_CHIPS) return null
  const shown = renderLevels(bi, chips, tier, options)
  if (shown.own.length + shown.borrowed.length <= MAX_CHIPS) return null
  const groups = chipGroups(bi, chips, feature)
  return new Set(groups.values()).size >= 2 ? groups : null
}

/** Where a node is shown as a chip (or, for a child, as a pin of its chip). */
export function pathOfNode(bi: BoardIndex, i: number, options: BoardOptions): BoardPath {
  const root = bi.rootOf[i]
  const tier = bi.tierOf[root]
  const feature = bi.featureOf[root]
  const opts = { ...options, showHidden: options.showHidden || !!bi.hidden[root] }
  const groups = grouped(bi, chipsIn(bi, tier, feature, opts), feature, tier, opts)
  const group = groups?.get(root)
  return { level: 'chip', tier, feature, ...(group !== undefined ? { group } : {}), chip: bi.index.nodes[root].id }
}

/** Where (chip, pin) an edge end lands on a level; undefined: not on this level's board. */
type Place = { chip: string; pin?: string } | undefined

interface Collector {
  wires: Map<string, BoardWire>
  add(e: number, from: Place, to: Place): void
  /** A wire that isn't an edge: a component to the state chip that lists what it shows then. */
  link(from: Place, to: Place): void
}

function collector(bi: BoardIndex, marks: ReviewMarks | undefined): Collector {
  const wires = new Map<string, BoardWire>()
  return {
    wires,
    add(e, from, to) {
      if (!from || !to || from.chip === to.chip) return
      const key = `${from.chip}|${from.pin ?? ''}>${to.chip}|${to.pin ?? ''}`
      let wire = wires.get(key)
      if (!wire) {
        wire = { id: key, from: from.chip, to: to.chip, fromPin: from.pin, toPin: to.pin, count: 0, types: {}, edges: [], violation: false, touched: false, conditional: true }
        wires.set(key, wire)
      }
      const type = bi.index.edges[e].type
      wire.count++
      wire.types[type] = (wire.types[type] ?? 0) + 1
      wire.edges.push(e)
      if (!isConditional(bi.index.edges[e])) wire.conditional = false
      if (bi.violationsByEdge.has(e)) wire.violation = true
      if (marks && (marks.touched.has(bi.index.edgeFrom[e]) || marks.touched.has(bi.index.edgeTo[e]))) wire.touched = true
    },
    link(from, to) {
      if (!from || !to) return
      const key = `${from.chip}|${from.pin ?? ''}>${to.chip}|${to.pin ?? ''}`
      if (wires.has(key)) return
      wires.set(key, { id: key, from: from.chip, to: to.chip, fromPin: from.pin, toPin: to.pin, count: 1, types: { shows: 1 }, edges: [], violation: false, touched: false, conditional: true })
    },
  }
}

const STATE_COLOR = '#facc15'

/**
 * Wires one edge; a render that happens only in some state goes through that state's chip:
 * WhatsNewPage → [state.status === 'loading'] → WhatsNewSkeleton. One state chip per component and condition.
 */
/**
 * A feature's board shows its top components (those no other component of the feature renders, e.g. its page) and what
 * they render directly, from this feature or another (ErrorState from Shared: drawn faded, wired only to them). What
 * those render in turn is on their own boards, where they lead to it, and where it says who renders it. Chips that
 * don't render or get rendered (hooks, types) stay, unless they only connect to what's left for deeper boards.
 */
function renderLevels(bi: BoardIndex, chips: number[], tier: string, options: BoardOptions): { own: number[]; borrowed: number[]; top: Set<number>; deeper: Set<number> } {
  const chipSet = new Set(chips)
  const renders = new Map<number, Set<number>>()
  const renderedBy = new Map<number, Set<number>>()
  for (const r of chips) {
    for (const e of bi.index.outEdges[r]) {
      if (bi.index.edges[e].type !== 'renders') continue
      const target = bi.rootOf[bi.index.edgeTo[e]]
      if (target === r) continue
      ;(renders.get(r) ?? renders.set(r, new Set()).get(r)!).add(target)
      if (chipSet.has(target)) (renderedBy.get(target) ?? renderedBy.set(target, new Set()).get(target)!).add(r)
    }
  }
  const renderers = chips.filter((r) => renders.has(r) || renderedBy.has(r))
  if (renderers.length === 0) return { own: chips, borrowed: [], top: new Set(), deeper: new Set() }
  let top = renderers.filter((r) => !renderedBy.has(r))
  // Rendering each other in a ring: no top; show them all.
  if (top.length === 0) top = renderers
  const shown = new Set(top)
  const borrowed: number[] = []
  for (const r of top) {
    for (const target of renders.get(r) ?? []) {
      if (chipSet.has(target)) shown.add(target)
      else if (bi.tierOf[target] === tier && visible(bi, target, options) && borrowed.length < MAX_BORROWED && !borrowed.includes(target)) borrowed.push(target)
    }
  }
  const deeper = new Set(renderers.filter((r) => !shown.has(r)))
  if (deeper.size === 0) return { own: chips, borrowed, top: new Set(top), deeper }
  // A hook or type used only by what's on deeper boards goes there with it.
  const neighbours = new Map<number, Set<number>>()
  bi.index.edges.forEach((_, e) => {
    const a = bi.rootOf[bi.index.edgeFrom[e]]
    const b = bi.rootOf[bi.index.edgeTo[e]]
    if (a === b || !chipSet.has(a) || !chipSet.has(b)) return
    ;(neighbours.get(a) ?? neighbours.set(a, new Set()).get(a)!).add(b)
    ;(neighbours.get(b) ?? neighbours.set(b, new Set()).get(b)!).add(a)
  })
  const own = chips.filter((r) => {
    if (deeper.has(r)) return false
    if (shown.has(r)) return true
    const next = neighbours.get(r)
    return !next || [...next].some((n) => !deeper.has(n))
  })
  // Gone with them: whatever else only they led to.
  for (const r of chips) if (!own.includes(r)) deeper.add(r)
  return { own, borrowed, top: new Set(top), deeper }
}

/** The chip of one of a component's states (one per component and condition), made on first use. */
function stateChip(chips: Map<string, BoardChip>, ownerChip: string, rc: RenderCase): string {
  const owner = chips.get(ownerChip)
  const label = caseLabel(rc)
  const id = `state:${ownerChip}:${label}`
  if (!chips.has(id)) {
    chips.set(
      id,
      blankChip({
        id,
        label,
        sub: rc.reads?.length ? rc.reads.map((r) => `${r.name} ← ${r.from}`).join(', ') : 'state',
        kind: 'state',
        color: STATE_COLOR,
        owner: owner?.node,
        description: `${owner?.label ?? 'It'} shows what's wired to the right, and what's listed on the chip, when ${label}.`,
        partition: owner?.partition,
        line: rc.line,
      }),
    )
  }
  return id
}

function addWire(bi: BoardIndex, c: Collector, chips: Map<string, BoardChip>, options: BoardOptions, e: number, from: Place, to: Place): void {
  const cases = options.states === false || !from || !to ? [] : renderCases(bi.index.edges[e])
  if (cases.length === 0) return c.add(e, from, to)
  for (const rc of cases) {
    if (rc.if.length === 0 && !rc.each) {
      c.add(e, from, to)
      continue
    }
    const id = stateChip(chips, from!.chip, rc)
    c.add(e, from, { chip: id })
    c.add(e, { chip: id }, to)
  }
}

/** The plain elements a component shows in a state (`adminNote && <p>…</p>`): listed on that state's chip. */
function addShownElements(bi: BoardIndex, c: Collector, chips: Map<string, BoardChip>, options: BoardOptions, root: number): void {
  if (options.states === false) return
  const node = bi.index.nodes[root]
  const shown = Array.isArray(node.attrs?.shows) ? (node.attrs.shows as ShownElement[]) : []
  for (const [k, element] of shown.entries()) {
    if (element.case.if.length === 0 && !element.case.each) continue
    const id = stateChip(chips, node.id, element.case)
    const chip = chips.get(id)!
    const label = `<${element.tag}${element.className ? `.${element.className}` : ''}>${element.content ? ` ${element.content}` : ''}`
    chip.pins.push({ id: `el:${k}`, label, kind: 'element', in: false, out: false })
    c.link({ chip: node.id }, { chip: id })
  }
}

function blankChip(partial: Omit<BoardChip, 'touched' | 'impacted' | 'violations' | 'pins'> & { pins?: BoardPin[] }): BoardChip {
  return { pins: [], touched: 0, impacted: 0, violations: 0, ...partial }
}

/** Counts review marks and violations per chip, given where each node lands. */
function mark(bi: BoardIndex, chips: Map<string, BoardChip>, chipOf: (i: number) => string | undefined, marks: ReviewMarks | undefined): void {
  for (let i = 0; i < bi.index.nodes.length; i++) {
    const touched = marks?.touched.has(i)
    const impacted = marks?.impacted.has(i)
    const violations = bi.violationsByNode.get(i)
    if (!touched && !impacted && !violations) continue
    const id = chipOf(i)
    const chip = id ? chips.get(id) : undefined
    if (!chip) continue
    if (touched) chip.touched++
    if (impacted) chip.impacted++
    if (violations) chip.violations += violations
  }
}

function overview(scene: BoardScene): BoardScene {
  for (const wire of scene.wires) wire.conditional = false
  return scene
}

export function buildScene(bi: BoardIndex, path: BoardPath, options: BoardOptions, marks?: ReviewMarks): BoardScene {
  switch (path.level) {
    // Overviews: no states are drawn there, so no wire is dashed for one (the wire's details still say when).
    case 'app':
      return overview(appScene(bi, options, marks))
    case 'tiers':
      return overview(tiersScene(bi, options, marks))
    case 'features':
      return overview(featuresScene(bi, path, options, marks))
    case 'chips':
      return chipsScene(bi, path, options, marks)
    case 'chip':
      return chipScene(bi, path, options, marks)
  }
}

function summaryOf(bi: BoardIndex, key: string): Summary | undefined {
  return bi.board.summaries?.[key]
}

function appScene(bi: BoardIndex, options: BoardOptions, marks: ReviewMarks | undefined): BoardScene {
  const tiers = tiersPresent(bi, options)
  const chip = blankChip({
    id: 'app',
    label: bi.index.graph.meta.repo.name,
    sub: `${tiers.length} tiers · ${bi.features.length - 1} features`,
    kind: 'app',
    color: '#38bdf8',
    count: tiers.length,
    enter: { level: 'tiers' },
    summary: summaryOf(bi, summaryKey.app()),
    pins: tiers.map((t) => ({ id: `t:${t.id}`, label: t.label, kind: 'tier', in: false, out: false })),
    palette: tiers.map((t) => ({ color: t.color, weight: 1 })),
  })
  mark(bi, new Map([['app', chip]]), () => 'app', marks)
  return { path: { level: 'app' }, direction: 'RIGHT', chips: [chip], wires: [] }
}

function tiersPresent(bi: BoardIndex, options: BoardOptions): TierDef[] {
  const present = new Set<string>()
  for (let i = 0; i < bi.index.nodes.length; i++) if (visible(bi, i, options)) present.add(bi.tierOf[i])
  return bi.tiers.filter((t) => present.has(t.id))
}

function tiersScene(bi: BoardIndex, options: BoardOptions, marks: ReviewMarks | undefined): BoardScene {
  const chips = new Map<string, BoardChip>()
  for (const tier of tiersPresent(bi, options)) {
    const featureCounts = new Map<string, number>()
    const roots = new Set<number>()
    for (let i = 0; i < bi.index.nodes.length; i++) {
      if (bi.tierOf[i] !== tier.id || !visible(bi, i, options)) continue
      if (bi.rootOf[i] === i) {
        roots.add(i)
        featureCounts.set(bi.featureOf[i], (featureCounts.get(bi.featureOf[i]) ?? 0) + 1)
      }
    }
    chips.set(
      tier.id,
      blankChip({
        id: tier.id,
        label: tier.label,
        sub: `${featureCounts.size} features · ${roots.size} chips`,
        kind: 'tier',
        color: tier.color,
        count: featureCounts.size,
        enter: { level: 'features', tier: tier.id },
        summary: summaryOf(bi, summaryKey.tier(tier.id)),
        description: tier.description,
        palette: bi.features.filter((f) => featureCounts.has(f.id)).map((f) => ({ color: f.color, weight: featureCounts.get(f.id)! })),
      }),
    )
  }
  const c = collector(bi, marks)
  const place = (i: number): Place => (visible(bi, i, options) && chips.has(bi.tierOf[i]) ? { chip: bi.tierOf[i] } : undefined)
  bi.index.edges.forEach((_, e) => {
    if (!wired(bi, e, options)) return
    c.add(e, place(bi.index.edgeFrom[e]), place(bi.index.edgeTo[e]))
  })
  mark(bi, chips, (i) => bi.tierOf[i], marks)
  return { path: { level: 'tiers' }, direction: 'DOWN', chips: [...chips.values()], wires: [...c.wires.values()] }
}

/** Off-board connectors: one per side and key, added as edges reach them. */
function connectors(chips: Map<string, BoardChip>) {
  return (side: 'in' | 'out', key: string, label: string, sub: string | undefined, color: string, enter: BoardPath): string => {
    const id = `${side}:${key}`
    if (!chips.has(id)) chips.set(id, blankChip({ id, label, sub, kind: 'connector', color, side, enter }))
    return id
  }
}

function featuresScene(bi: BoardIndex, path: Extract<BoardPath, { level: 'features' }>, options: BoardOptions, marks: ReviewMarks | undefined): BoardScene {
  const chips = new Map<string, BoardChip>()
  const counts = new Map<string, number>()
  for (let i = 0; i < bi.index.nodes.length; i++) {
    if (bi.tierOf[i] !== path.tier || !visible(bi, i, options) || bi.rootOf[i] !== i) continue
    counts.set(bi.featureOf[i], (counts.get(bi.featureOf[i]) ?? 0) + 1)
  }
  // Children placed in a feature their chip isn't in (an API client's calls) still make it present.
  for (let i = 0; i < bi.index.nodes.length; i++) {
    if (bi.tierOf[i] === path.tier && visible(bi, i, options) && !counts.has(bi.featureOf[i])) counts.set(bi.featureOf[i], 0)
  }
  for (const feature of bi.features) {
    const count = counts.get(feature.id)
    if (count === undefined) continue
    chips.set(
      `f:${feature.id}`,
      blankChip({
        id: `f:${feature.id}`,
        label: feature.label,
        sub: `${count} chip${count === 1 ? '' : 's'}`,
        kind: 'feature',
        color: feature.color,
        count,
        enter: { level: 'chips', tier: path.tier, feature: feature.id },
        summary: summaryOf(bi, summaryKey.feature(feature.id, path.tier)),
      }),
    )
  }
  const connector = connectors(chips)
  const c = collector(bi, marks)
  const place = (i: number, side: 'in' | 'out'): Place => {
    if (!visible(bi, i, options)) return undefined
    if (bi.tierOf[i] === path.tier) return { chip: `f:${bi.featureOf[i]}` }
    const tier = bi.tierById.get(bi.tierOf[i])
    return { chip: connector(side, bi.tierOf[i], tier?.label ?? bi.tierOf[i], side === 'in' ? 'calls in' : 'called', tier?.color ?? '#94a3b8', { level: 'features', tier: bi.tierOf[i] }) }
  }
  bi.index.edges.forEach((_, e) => {
    if (!wired(bi, e, options)) return
    const from = bi.index.edgeFrom[e]
    const to = bi.index.edgeTo[e]
    if (bi.tierOf[from] !== path.tier && bi.tierOf[to] !== path.tier) return
    c.add(e, place(from, 'in'), place(to, 'out'))
  })
  mark(bi, chips, (i) => (bi.tierOf[i] === path.tier ? `f:${bi.featureOf[i]}` : undefined), marks)
  return { path, direction: 'RIGHT', chips: [...chips.values()], wires: [...c.wires.values()] }
}

/** Pins a chip shows on a feature's board: its children in the feature, then members with wires. */
function chipPins(bi: BoardIndex, root: number, feature: string | null, options: BoardOptions): BoardPin[] {
  const pins: BoardPin[] = []
  for (const child of bi.index.children[root]) {
    if (!visible(bi, child, options)) continue
    if (feature !== null && bi.featureOf[child] !== feature) continue
    const node = bi.index.nodes[child]
    pins.push({ id: `n:${child}`, label: shortLabel(node.label, bi.index.nodes[root].label), kind: node.kind, node: child, in: false, out: false })
  }
  return pins
}

function memberPins(node: { attrs?: Record<string, unknown> }): BoardPin[] {
  return membersOf(node as never).map((member) => ({ id: `m:${member.name}:${member.line ?? 0}`, label: member.name, kind: member.kind, member, in: false, out: false }))
}

/** "Profile.FirstName" on Profile → "FirstName". */
function shortLabel(label: string, parent: string): string {
  return label.startsWith(`${parent}.`) ? label.slice(parent.length + 1) : label
}

/** The pin an edge end lands on: a child (or the child above it), else the member whose code holds the evidence line. */
function pinFor(bi: BoardIndex, i: number, e: number, pins: Map<string, BoardPin>, side: 'from' | 'to'): string | undefined {
  const root = bi.rootOf[i]
  if (i !== root) {
    const id = `n:${bi.pinOf[i]}`
    return pins.has(id) ? id : undefined
  }
  if (side !== 'from') return undefined
  const evidence = bi.index.edges[e].evidence?.[0]
  const node = bi.index.nodes[root]
  if (!evidence || evidence.file !== node.file) return undefined
  const member = memberAt(node, evidence.line)
  if (!member) return undefined
  const id = `m:${member.name}:${member.line ?? 0}`
  return pins.has(id) ? id : undefined
}

function chipsScene(bi: BoardIndex, path: Extract<BoardPath, { level: 'chips' }>, options: BoardOptions, marks: ReviewMarks | undefined): BoardScene {
  const all = chipsIn(bi, path.tier, path.feature, options)
  const groups = grouped(bi, all, path.feature, path.tier, options)
  if (groups && path.group === undefined) return groupsScene(bi, path, all, groups, options, marks)
  const { own, borrowed: borrowedList, top, deeper } = renderLevels(bi, groups ? all.filter((c) => groups.get(c) === path.group) : all, path.tier, options)
  const ownSet = new Set(own)
  const borrowed = new Set(borrowedList)
  const roots = [...own, ...borrowed]
  const rootSet = new Set(roots)
  const chips = new Map<string, BoardChip>()
  const pinMaps = new Map<number, Map<string, BoardPin>>()
  for (const root of roots) {
    const node = bi.index.nodes[root]
    const home = bi.featureOf[root] === path.feature
    const pinMap = new Map<string, BoardPin>()
    for (const pin of [...chipPins(bi, root, path.feature, options), ...memberPins(node)]) pinMap.set(pin.id, pin)
    pinMaps.set(root, pinMap)
    chips.set(
      node.id,
      blankChip({
        id: node.id,
        label: node.label,
        sub: borrowed.has(root) ? `${bi.index.kinds.get(node.kind)?.label ?? node.kind} · ${featureLabel(bi, bi.featureOf[root])}` : (bi.index.kinds.get(node.kind)?.label ?? node.kind),
        kind: 'node',
        color: bi.index.kinds.get(node.kind)?.color ?? '#94a3b8',
        ghost: !home,
        node: root,
        enter: { level: 'chip', tier: path.tier, feature: path.feature, ...(path.group !== undefined ? { group: path.group } : {}), chip: node.id },
        summary: summaryOf(bi, node.id),
        description: node.description,
        partition: bi.partitionOf[root],
      }),
    )
  }
  const connector = connectors(chips)
  const c = collector(bi, marks)
  const inView = (i: number) => rootSet.has(bi.rootOf[i]) && (bi.featureOf[i] === path.feature || i === bi.rootOf[i])
  const place = (i: number, e: number, side: 'from' | 'to'): Place => {
    if (!visible(bi, i, options)) return undefined
    if (inView(i)) {
      const root = bi.rootOf[i]
      const pin = pinFor(bi, i, e, pinMaps.get(root)!, side)
      return { chip: bi.index.nodes[root].id, pin }
    }
    const tier = bi.tierOf[i]
    const feature = bi.featureOf[i]
    const key = tier === path.tier ? feature : `${tier}/${feature}`
    const label = featureLabel(bi, feature)
    const sub = tier === path.tier ? undefined : tierLabel(bi, tier)
    if (groups && feature === path.feature && tier === path.tier) {
      const group = groups.get(bi.rootOf[i]) ?? ''
      return {
        chip: connector(side === 'from' ? 'in' : 'out', `g/${group}`, group, 'folder', bi.featureById.get(feature)?.color ?? '#94a3b8', { level: 'chips', tier, feature, group }),
      }
    }
    return { chip: connector(side === 'from' ? 'in' : 'out', key, label, sub, bi.featureById.get(feature)?.color ?? '#94a3b8', { level: 'chips', tier, feature }) }
  }
  bi.index.edges.forEach((_, e) => {
    if (!wired(bi, e, options)) return
    const from = bi.index.edgeFrom[e]
    const to = bi.index.edgeTo[e]
    if (!inView(from) && !inView(to)) return
    // What's left for deeper boards isn't wired here, nor what the components under the top ones render.
    if (deeper.has(bi.rootOf[from]) || deeper.has(bi.rootOf[to])) return
    if (bi.index.edges[e].type === 'renders' && top.size > 0 && !top.has(bi.rootOf[from]) && !rootSet.has(bi.rootOf[to])) return
    // A borrowed chip shows only its wires to this feature's own chips.
    if (borrowed.has(bi.rootOf[from]) && !ownSet.has(bi.rootOf[to])) return
    if (borrowed.has(bi.rootOf[to]) && !ownSet.has(bi.rootOf[from])) return
    addWire(bi, c, chips, options, e, place(from, e, 'from'), place(to, e, 'to'))
  })
  for (const root of own) addShownElements(bi, c, chips, options, root)
  const wires = [...c.wires.values()]
  const note = trimConnectors(chips, wires)
  pruneStates(chips, wires)
  finishPins(chips, pinMaps, wires, bi, MAX_PINS)
  mark(bi, chips, (i) => (inView(i) ? bi.index.nodes[bi.rootOf[i]].id : undefined), marks)
  return { path, direction: 'RIGHT', chips: [...chips.values()], wires: wires.filter((w) => chips.has(w.from) && chips.has(w.to)), note }
}

function groupsScene(
  bi: BoardIndex,
  path: Extract<BoardPath, { level: 'chips' }>,
  all: number[],
  groups: Map<number, string>,
  options: BoardOptions,
  marks: ReviewMarks | undefined,
): BoardScene {
  const chips = new Map<string, BoardChip>()
  const color = bi.featureById.get(path.feature)?.color ?? '#94a3b8'
  const sizes = new Map<string, number>()
  for (const root of all) sizes.set(groups.get(root)!, (sizes.get(groups.get(root)!) ?? 0) + 1)
  for (const [group, size] of [...sizes].sort(([a], [b]) => a.localeCompare(b))) {
    chips.set(
      `g:${group}`,
      blankChip({ id: `g:${group}`, label: group, sub: `folder · ${size} chip${size === 1 ? '' : 's'}`, kind: 'group', color, count: size, enter: { level: 'chips', tier: path.tier, feature: path.feature, group } }),
    )
  }
  const rootSet = new Set(all)
  const inView = (i: number) => rootSet.has(bi.rootOf[i]) && (bi.featureOf[i] === path.feature || i === bi.rootOf[i])
  const connector = connectors(chips)
  const c = collector(bi, marks)
  const place = (i: number, side: 'from' | 'to'): Place => {
    if (!visible(bi, i, options)) return undefined
    if (inView(i)) return { chip: `g:${groups.get(bi.rootOf[i])}` }
    const tier = bi.tierOf[i]
    const feature = bi.featureOf[i]
    return {
      chip: connector(side === 'from' ? 'in' : 'out', `${tier}/${feature}`, featureLabel(bi, feature), tier === path.tier ? undefined : tierLabel(bi, tier), bi.featureById.get(feature)?.color ?? '#94a3b8', {
        level: 'chips',
        tier,
        feature,
      }),
    }
  }
  bi.index.edges.forEach((_, e) => {
    if (!wired(bi, e, options)) return
    const from = bi.index.edgeFrom[e]
    const to = bi.index.edgeTo[e]
    if (!inView(from) && !inView(to)) return
    c.add(e, place(from, 'from'), place(to, 'to'))
  })
  const wires = [...c.wires.values()]
  const note = trimConnectors(chips, wires)
  pruneStates(chips, wires)
  mark(bi, chips, (i) => (inView(i) ? `g:${groups.get(bi.rootOf[i])}` : undefined), marks)
  return { path, direction: 'RIGHT', chips: [...chips.values()], wires: wires.filter((w) => chips.has(w.from) && chips.has(w.to)), note }
}

/** State chips left with nothing to show (what they led to wasn't drawn, and no elements of their own) go too. */
function pruneStates(chips: Map<string, BoardChip>, wires: BoardWire[]): void {
  for (const chip of [...chips.values()]) {
    if (chip.kind === 'state' && chip.pins.length === 0 && !wires.some((w) => w.from === chip.id && chips.has(w.to))) chips.delete(chip.id)
  }
}

/** Keeps the busiest connectors per side; says how many were left out. */
function trimConnectors(chips: Map<string, BoardChip>, wires: BoardWire[], limit = MAX_CONNECTORS): string | undefined {
  const weight = new Map<string, number>()
  for (const wire of wires) {
    for (const end of [wire.from, wire.to]) if (chips.get(end)?.kind === 'connector') weight.set(end, (weight.get(end) ?? 0) + wire.count)
  }
  let dropped = 0
  for (const side of ['in', 'out'] as const) {
    const list = [...chips.values()].filter((c) => c.kind === 'connector' && c.side === side).sort((a, b) => (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0))
    for (const chip of list.slice(limit)) {
      chips.delete(chip.id)
      dropped++
    }
  }
  return dropped > 0 ? `${dropped} smaller connection${dropped === 1 ? '' : 's'} to other features not drawn` : undefined
}

/** Marks pins wires use, keeps those (children first), and caps the rest. */
function finishPins(chips: Map<string, BoardChip>, pinMaps: Map<number, Map<string, BoardPin>>, wires: BoardWire[], bi: BoardIndex, limit: number): void {
  const used = new Set<string>()
  for (const wire of wires) {
    if (wire.fromPin) used.add(`${wire.from}|${wire.fromPin}|out`)
    if (wire.toPin) used.add(`${wire.to}|${wire.toPin}|in`)
  }
  for (const [root, pins] of pinMaps) {
    const chip = chips.get(bi.index.nodes[root].id)
    if (!chip) continue
    const list: BoardPin[] = []
    for (const pin of pins.values()) {
      pin.in = used.has(`${chip.id}|${pin.id}|in`)
      pin.out = used.has(`${chip.id}|${pin.id}|out`)
      // Children always show (they are the chip's parts); members only when wired.
      if (pin.node !== undefined || pin.in || pin.out) list.push(pin)
    }
    const kept = list.slice(0, limit)
    const keptIds = new Set(kept.map((p) => p.id))
    // A wire on a pin left out ends on the chip's body instead.
    for (const wire of wires) {
      if (wire.from === chip.id && wire.fromPin && !keptIds.has(wire.fromPin)) wire.fromPin = undefined
      if (wire.to === chip.id && wire.toPin && !keptIds.has(wire.toPin)) wire.toPin = undefined
    }
    chip.pins = kept
    if (pins.size > kept.length) chip.morePins = pins.size - kept.length
  }
  // Wires whose pins were dropped may now coincide: merge them.
  const merged = new Map<string, BoardWire>()
  for (const wire of wires) {
    const key = `${wire.from}|${wire.fromPin ?? ''}>${wire.to}|${wire.toPin ?? ''}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...wire, id: key })
      continue
    }
    existing.count += wire.count
    existing.edges.push(...wire.edges)
    for (const [type, n] of Object.entries(wire.types)) existing.types[type] = (existing.types[type] ?? 0) + n
    existing.violation ||= wire.violation
    existing.touched ||= wire.touched
  }
  wires.splice(0, wires.length, ...merged.values())
}

function chipScene(bi: BoardIndex, path: Extract<BoardPath, { level: 'chip' }>, options: BoardOptions, marks: ReviewMarks | undefined): BoardScene {
  const root = bi.index.byId.get(path.chip)
  if (root === undefined) return { path, direction: 'RIGHT', chips: [], wires: [], note: 'This chip is no longer in the map' }
  const node = bi.index.nodes[root]
  const chips = new Map<string, BoardChip>()
  const pins = new Map<string, BoardPin>()
  for (const pin of [...chipPins(bi, root, null, { ...options, showHidden: true }), ...memberPins(node)]) pins.set(pin.id, pin)
  chips.set(
    node.id,
    blankChip({
      id: node.id,
      label: node.label,
      sub: `${bi.index.kinds.get(node.kind)?.label ?? node.kind} · ${featureLabel(bi, bi.featureOf[root])}`,
      kind: 'node',
      color: bi.index.kinds.get(node.kind)?.color ?? '#94a3b8',
      node: root,
      summary: summaryOf(bi, node.id),
      description: node.description,
    }),
  )
  const connector = connectors(chips)
  const c = collector(bi, marks)
  const other = (i: number, side: 'in' | 'out'): Place => {
    const r = bi.rootOf[i]
    const target = bi.index.nodes[r]
    const sub = `${tierLabel(bi, bi.tierOf[r])} · ${featureLabel(bi, bi.featureOf[r])}`
    return { chip: connector(side, target.id, target.label, sub, bi.index.kinds.get(target.kind)?.color ?? '#94a3b8', pathOfNode(bi, r, options)) }
  }
  bi.index.edges.forEach((_, e) => {
    if (!wired(bi, e, options)) return
    const from = bi.index.edgeFrom[e]
    const to = bi.index.edgeTo[e]
    const fromHere = bi.rootOf[from] === root
    const toHere = bi.rootOf[to] === root
    if (fromHere === toHere) return
    if (fromHere && !visible(bi, to, options)) return
    if (toHere && !visible(bi, from, options)) return
    const here = (i: number, side: 'from' | 'to'): Place => ({ chip: node.id, pin: pinFor(bi, i, e, pins, side) })
    addWire(bi, c, chips, options, e, fromHere ? here(from, 'from') : other(from, 'in'), toHere ? here(to, 'to') : other(to, 'out'))
  })
  addShownElements(bi, c, chips, options, root)
  const wires = [...c.wires.values()]
  const note = trimConnectors(chips, wires, 24)
  pruneStates(chips, wires)
  finishPins(chips, new Map([[root, pins]]), wires, bi, 200)
  // On its own board a chip shows every member, wired or not.
  const chip = chips.get(node.id)!
  const shown = new Set(chip.pins.map((p) => p.id))
  for (const pin of pins.values()) if (!shown.has(pin.id)) chip.pins.push(pin)
  chip.morePins = undefined
  mark(bi, chips, (i) => (bi.rootOf[i] === root ? node.id : undefined), marks)
  return { path, direction: 'RIGHT', chips: [...chips.values()], wires: wires.filter((w) => chips.has(w.from) && chips.has(w.to)), note }
}
