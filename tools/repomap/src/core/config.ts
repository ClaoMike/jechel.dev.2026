/**
 * Loads repomap.config.json (JSON with comments allowed) and resolves `extends` chains.
 *
 * Merge rules (child over parent):
 * - arrays of objects with an `id` (layers, roles, kinds, edgeTypes, presets, plugins) merge by id;
 *   a child entry with `"enabled": false` removes a plugin
 * - `exclude`, `layerRules`, `roleRules` concatenate, child first (child rules win: first match wins)
 * - everything else: child replaces parent
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EdgeTypeDef, KindDef, LayerDef, PresetDef, RoleDef } from '../shared/types.ts'

export interface LayerRule {
  /** Globs (repo-relative). */
  match?: string[]
  /** A file name glob; every file under a directory containing it gets the layer. */
  marker?: string
  /** With `marker`: the marker file must contain this text. */
  contains?: string
  layer: string
  reason?: string
}

export interface RoleRule {
  match: string[]
  role: string
  reason?: string
}

export interface PluginConfig {
  id: string
  label?: string
  kind: 'extractor' | 'linker'
  /** Command + args, run with cwd = the repomap folder. `node` means the current Node binary. */
  command: string[]
  /** Optional build step run once before the first use (e.g. compiling a C# plugin). */
  build?: string[]
  /** Folder whose content is hashed into the cache key (relative to the repomap folder). */
  source?: string
  include?: string[]
  exclude?: string[]
  /** Only pass files from these layers. */
  layers?: string[]
  /** Executables that must exist; the plugin is skipped with a warning otherwise. */
  requires?: string[]
  options?: Record<string, unknown>
  enabled?: boolean
  timeoutMs?: number
}

/** The History tab (git.json). */
export interface HistoryConfig {
  enabled: boolean
  /** Newest commits to read (across all branches). */
  maxCommits: number
  /** Changed files listed per commit (the totals always count all of them). */
  maxFilesPerCommit: number
  /** Read pull requests from api.github.com when the main remote is on github.com ("auto"), or never ("off"). */
  github: 'auto' | 'off'
  /** Minutes to reuse the last GitHub answer. */
  githubCacheMinutes: number
  maxPullRequests: number
}

export const DEFAULT_HISTORY: HistoryConfig = {
  enabled: true,
  maxCommits: 2000,
  maxFilesPerCommit: 150,
  github: 'auto',
  githubCacheMinutes: 10,
  maxPullRequests: 200,
}

export interface RepoMapConfig {
  name: string
  /** Absolute path of the repository to map. */
  repoRoot: string
  /** Absolute path of the graph.json to write. */
  output: string
  /** Absolute path of the loaded config file. */
  configPath: string
  /** Absolute path of the repomap tool folder (plugins are resolved from here). */
  toolRoot: string
  exclude: string[]
  layers: LayerDef[]
  layerRules: LayerRule[]
  defaultLayer: string
  roles: RoleDef[]
  roleRules: RoleRule[]
  defaultRole: string
  kinds: KindDef[]
  edgeTypes: EdgeTypeDef[]
  presets: PresetDef[]
  layout: { layerGap: number; seed: number }
  history: HistoryConfig
  plugins: PluginConfig[]
}

export const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

type Json = Record<string, unknown>

const CONCAT_KEYS = new Set(['exclude', 'layerRules', 'roleRules'])

export function loadConfig(configPath: string): RepoMapConfig {
  const absolute = resolve(configPath)
  if (!existsSync(absolute)) throw new Error(`Config not found: ${absolute}`)
  const merged = loadWithExtends(absolute, new Set())
  const baseDir = dirname(absolute)

  const repoRoot = resolve(baseDir, String(merged.repoRoot ?? '.'))
  const output = resolve(baseDir, String(merged.output ?? '.out/graph.json'))
  const plugins = ((merged.plugins as PluginConfig[] | undefined) ?? []).filter((p) => p.enabled !== false)

  const config: RepoMapConfig = {
    name: String(merged.name ?? repoRoot.split(/[\\/]/).pop() ?? 'repository'),
    repoRoot,
    output,
    configPath: absolute,
    toolRoot: TOOL_ROOT,
    exclude: (merged.exclude as string[] | undefined) ?? [],
    layers: (merged.layers as LayerDef[] | undefined) ?? [],
    layerRules: (merged.layerRules as LayerRule[] | undefined) ?? [],
    defaultLayer: String(merged.defaultLayer ?? 'other'),
    roles: (merged.roles as RoleDef[] | undefined) ?? [],
    roleRules: (merged.roleRules as RoleRule[] | undefined) ?? [],
    defaultRole: String(merged.defaultRole ?? 'production'),
    kinds: (merged.kinds as KindDef[] | undefined) ?? [],
    edgeTypes: (merged.edgeTypes as EdgeTypeDef[] | undefined) ?? [],
    presets: (merged.presets as PresetDef[] | undefined) ?? [],
    layout: { layerGap: 90, seed: 7, ...((merged.layout as Json | undefined) ?? {}) } as RepoMapConfig['layout'],
    history: { ...DEFAULT_HISTORY, ...((merged.history as Json | undefined) ?? {}) } as HistoryConfig,
    plugins,
  }
  for (const item of [...config.layers, ...config.roles, ...config.kinds, ...config.edgeTypes]) item.color = normalizeColor(item.color)
  validateConfig(config)
  return config
}

/** "#abc" → "#aabbcc" (graph.json stores six-digit colours); anything else is left for validation. */
export function normalizeColor(color: unknown): string {
  if (typeof color !== 'string') return color as string
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color.trim())
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : color.trim()
}

function loadWithExtends(path: string, seen: Set<string>): Json {
  if (seen.has(path)) throw new Error(`Circular "extends" in ${path}`)
  seen.add(path)
  const raw = parseJsonc(readFileSync(path, 'utf8'), path)
  const parentRef = raw.extends
  delete raw.extends
  if (typeof parentRef !== 'string') return raw
  const parentPath = isAbsolute(parentRef) ? parentRef : resolve(dirname(path), parentRef)
  const parent = loadWithExtends(parentPath, seen)
  return mergeConfig(parent, raw)
}

export function mergeConfig(parent: Json, child: Json): Json {
  const result: Json = { ...parent }
  for (const [key, value] of Object.entries(child)) {
    const base = parent[key]
    if (CONCAT_KEYS.has(key) && Array.isArray(value) && Array.isArray(base)) {
      result[key] = [...value, ...base]
    } else if (Array.isArray(value) && Array.isArray(base) && isIdArray(value) && isIdArray(base)) {
      result[key] = mergeById(base as Json[], value as Json[])
    } else {
      result[key] = value
    }
  }
  return result
}

function isIdArray(value: unknown[]): boolean {
  return value.every((item) => typeof item === 'object' && item !== null && typeof (item as Json).id === 'string')
}

function mergeById(parent: Json[], child: Json[]): Json[] {
  const result = parent.map((item) => ({ ...item }))
  for (const item of child) {
    const index = result.findIndex((existing) => existing.id === item.id)
    if (index >= 0) result[index] = { ...result[index], ...item }
    else result.push({ ...item })
  }
  return result
}

function validateConfig(config: RepoMapConfig): void {
  const problems: string[] = []
  if (config.layers.length === 0) problems.push('no layers defined')
  const ids = (items: { id: string }[], what: string) => {
    const seen = new Set<string>()
    for (const item of items) {
      if (seen.has(item.id)) problems.push(`duplicate ${what} id "${item.id}"`)
      seen.add(item.id)
    }
  }
  ids(config.layers, 'layer')
  ids(config.roles, 'role')
  ids(config.kinds, 'kind')
  ids(config.edgeTypes, 'edge type')
  ids(config.plugins, 'plugin')
  for (const plugin of config.plugins) {
    if (!Array.isArray(plugin.command) || plugin.command.length === 0) problems.push(`plugin "${plugin.id}" has no command`)
    if (plugin.kind !== 'extractor' && plugin.kind !== 'linker') problems.push(`plugin "${plugin.id}" kind must be extractor or linker`)
  }
  for (const role of config.roles) {
    if (role.parent && !config.roles.some((r) => r.id === role.parent)) problems.push(`role "${role.id}" has unknown parent "${role.parent}"`)
  }
  for (const [what, items] of [['layer', config.layers], ['role', config.roles], ['kind', config.kinds], ['edge type', config.edgeTypes]] as const) {
    for (const item of items) {
      if (!/^#[0-9a-f]{6}$/i.test(item.color ?? '')) problems.push(`${what} "${item.id}": color must look like #1e90ff (got ${JSON.stringify(item.color)})`)
    }
  }
  if (config.history.github !== 'auto' && config.history.github !== 'off') problems.push('history.github must be "auto" or "off"')
  if (!(config.history.maxCommits > 0)) problems.push('history.maxCommits must be a positive number')
  if (problems.length > 0) throw new Error(`Invalid config ${config.configPath}:\n  - ${problems.join('\n  - ')}`)
}

/** JSON with // and /* *\/ comments and trailing commas. */
export function parseJsonc(text: string, source = 'config'): Json {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (inString) {
      out += char
      if (char === '\\') {
        out += next ?? ''
        i++
      } else if (char === '"') {
        inString = false
      }
    } else if (char === '"') {
      inString = true
      out += char
    } else if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (char === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else {
      out += char
    }
  }
  out = out.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(out) as Json
  } catch (error) {
    throw new Error(`Cannot parse ${source}: ${(error as Error).message}`)
  }
}
