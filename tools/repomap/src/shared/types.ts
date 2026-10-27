/**
 * The graph.json contract shared by the CLI, the plugins and the viewer.
 * Isomorphic: no Node or DOM APIs in src/shared.
 *
 * JSON Schemas describing the same shapes live in /schema (used to validate plugin output and graph.json).
 */

/** Version of the graph.json format. Bump on breaking changes. */
export const GRAPH_VERSION = 1

/** Version of the plugin stdin/stdout protocol. */
export const PROTOCOL_VERSION = 1

import type { BoardData, FeatureSource } from './board.ts'

export type Visibility = 'show' | 'dim' | 'hide'
export type EdgeSource = 'static' | 'llm' | 'manual'

/** Node shapes the viewer can draw. Kinds pick one in config. */
export type Shape =
  | 'sphere'
  | 'box'
  | 'octahedron'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'tetrahedron'
  | 'dodecahedron'
  | 'icosahedron'
  | 'capsule'
  | 'tile'
  | 'disc'

/** How nodes of a role are rendered: solid, or a translucent "ghost" (e.g. generated code). */
export type RoleStyle = 'solid' | 'ghost'

// ---------- Vocabulary (comes from config, embedded in graph.json so the viewer never reads config) ----------

export interface LayerDef {
  id: string
  label: string
  color: string
  /** All roles on the main plane (no sub-planes), e.g. for an infra layer made of config and tooling. */
  flat?: boolean
  /** Distance to the layer above (default: the layout's layerGap), e.g. smaller for the layers of one app. */
  gap?: number
  /** `tree`: this layer's nodes are laid out with every other tree layer as one radial tree from the entry point. */
  arrange?: 'force' | 'tree'
  description?: string
}

export interface RoleDef {
  id: string
  label: string
  color: string
  /** Parent role id; `test/unit` has parent `test`. The menu renders roles as a tree. */
  parent?: string
  style?: RoleStyle
  /** Vertical offset of the role's sub-plane below its layer plane (production = 0). */
  planeOffset?: number
  description?: string
}

export interface KindDef {
  id: string
  label: string
  color: string
  shape: Shape
  /** Relative node size (1 = default). */
  size?: number
  /** 0-10: how eagerly labels are shown when zoomed out. */
  labelPriority?: number
  description?: string
}

export interface EdgeTypeDef {
  id: string
  label: string
  color: string
  /** Followed transitively by trace mode (request/data flow). */
  flow?: boolean
  /** Shown one hop around the selected node in trace mode (tests, migrations, config...). */
  context?: boolean
  description?: string
}

/** A filter state. Missing entries fall back to `default` (show). Parents apply to children (roles). */
export interface FilterSpec {
  default?: Visibility
  layers?: Record<string, Visibility>
  /** Key: a kind id (every layer) or "layer/kind". */
  kinds?: Record<string, Visibility>
  roles?: Record<string, Visibility>
  edgeTypes?: Record<string, Visibility>
  sources?: Record<string, Visibility>
  minConfidence?: number
}

export interface PresetDef {
  id: string
  label: string
  description?: string
  filter: FilterSpec
}

// ---------- graph.json ----------

export interface PluginRunInfo {
  id: string
  kind: 'extractor' | 'linker'
  cached: boolean
  durationMs: number
  nodes: number
  edges: number
  facts: number
  diagnostics: number
  error?: string
}

export interface GraphChanges {
  /** ISO time of the previous build this graph was compared with. */
  since: string
  previousCommit?: string
  addedNodes: string[]
  removedNodes: { id: string; label: string; layer: string; kind: string }[]
  addedEdges: number
  removedEdges: number
}

export interface GraphMeta {
  tool: { name: string; version: string }
  repo: { name: string; root?: string; commit?: string; branch?: string; dirty?: boolean }
  generatedAt: string
  layers: LayerDef[]
  roles: RoleDef[]
  kinds: KindDef[]
  edgeTypes: EdgeTypeDef[]
  presets: PresetDef[]
  /** `signature` hashes the layout's inputs: a build with the same inputs keeps the positions as they are. */
  layout?: { algorithm: string; layerGap: number; seed: number; signature?: string }
  plugins?: PluginRunInfo[]
  changes?: GraphChanges
  stats?: { nodes: number; edges: number; unresolved: number; durationMs?: number }
}

export interface Evidence {
  file: string
  line?: number
}

export interface GraphNode {
  /** Stable id: `layer:symbolType:qualifiedName`, e.g. `backend:class:Portfolio.Api.Data.Profile`. */
  id: string
  label: string
  kind: string
  layer: string
  role: string
  /** Containing node (file → class → member, table → column). */
  parent?: string
  /** Repo-relative path, forward slashes. */
  file?: string
  line?: number
  /** Last line of the declaration (the code viewer highlights line..endLine). */
  endLine?: number
  tags?: string[]
  attrs?: Record<string, unknown>
  description?: string
  descriptionSource?: 'doc-comment' | 'llm' | 'manual' | 'derived'
  /** Why the node got its role (rule, manifest signal...). */
  roleReason?: string
  /** Layout position [x, y, z], baked by the builder. */
  pos?: [number, number, number]
  /** The feature (vertical slice) the node belongs to, set by the builder (see shared/board.ts). */
  feature?: string
  /** How it got it: its folder, config, the AI, its neighbours or parent, or nothing (shared). */
  featureSource?: FeatureSource
}

export interface GraphEdge {
  from: string
  to: string
  type: string
  source: EdgeSource
  /** 0..1. Static facts are 1; heuristics and LLM suggestions are lower. */
  confidence: number
  evidence?: Evidence[]
  attrs?: Record<string, unknown>
}

/** A reference that could not be resolved to a node, e.g. a frontend call to a route that does not exist. */
export interface UnresolvedLink {
  from: string
  type: string
  /** Human-readable target, e.g. "GET /api/does-not-exist". */
  target: string
  reason: string
  evidence?: Evidence[]
}

export interface Diagnostic {
  level: 'info' | 'warn' | 'error'
  message: string
  plugin?: string
  file?: string
  line?: number
}

export interface RepoGraph {
  version: number
  meta: GraphMeta
  nodes: GraphNode[]
  edges: GraphEdge[]
  unresolved: UnresolvedLink[]
  diagnostics?: Diagnostic[]
  /** Tiers, features, AI summaries and rule violations for the Board tab. */
  board?: BoardData
}

// ---------- Plugin protocol (stdin request → stdout output) ----------

export interface FileEntry {
  /** Repo-relative path, forward slashes. */
  path: string
  layer: string
  role: string
  roleReason: string
}

export interface Vocabulary {
  layers: LayerDef[]
  roles: RoleDef[]
  kinds: KindDef[]
  edgeTypes: EdgeTypeDef[]
}

export interface PluginRequest {
  protocol: number
  /** Absolute path of the analysed repository. */
  repoRoot: string
  plugin: { id: string; kind: 'extractor' | 'linker'; options: Record<string, unknown> }
  /** Files this plugin should look at (already filtered by its include/layers settings). */
  files: FileEntry[]
  /** Files already fully represented by earlier plugins. */
  claimed: string[]
  vocabulary: Vocabulary
  /** Linkers only: the merged graph so far, plus the facts extractors reported. */
  graph?: { nodes: GraphNode[]; edges: GraphEdge[]; facts: Fact[] }
}

/** Plugins may leave layer/role out; the builder fills them in from the node's file and config rules. */
export interface PluginNode extends Omit<GraphNode, 'layer' | 'role' | 'pos'> {
  layer?: string
  role?: string
}

export interface PluginEdge extends Omit<GraphEdge, 'source' | 'confidence'> {
  source?: EdgeSource
  confidence?: number
}

/**
 * Something an extractor observed but cannot resolve alone. Linkers turn facts into edges.
 * - http: a call/mock/request to `method url` (resolved against backend endpoints)
 * - navigate: a navigation to `url` (resolved against frontend routes, then endpoints)
 * - file-ref: a reference to another file (resolved to the node that represents it)
 */
export interface Fact {
  type: 'http' | 'navigate' | 'file-ref'
  from: string
  /** Edge type to create once resolved: http, tests, mocks, navigates, uses... */
  edgeType: string
  method?: string
  url?: string
  path?: string
  confidence?: number
  evidence?: Evidence[]
  attrs?: Record<string, unknown>
}

export interface PluginOutput {
  protocol: number
  nodes?: PluginNode[]
  edges?: PluginEdge[]
  facts?: Fact[]
  /** Files this plugin fully represents (the generic file extractor skips them). */
  claims?: string[]
  /** Linkers: references that could not be resolved (e.g. a call to a route that doesn't exist). */
  unresolved?: UnresolvedLink[]
  diagnostics?: Diagnostic[]
}

/** Id of the node representing a whole file. Used by several plugins, so it lives here. */
export function fileNodeId(layer: string, path: string): string {
  return `${layer}:file:${path}`
}

/** Stable key of an edge (an edge is unique per from/type/to). */
export function edgeKey(edge: { from: string; type: string; to: string }): string {
  return `${edge.from}|${edge.type}|${edge.to}`
}
