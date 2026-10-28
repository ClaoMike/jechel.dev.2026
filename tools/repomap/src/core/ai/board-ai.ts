/**
 * The Board's AI work (Claude: through Claude Code on this machine, or the API with the assistant's key):
 *
 * - place: chips nothing placed in a feature (no folder, neighbours disagree) → a feature, or shared
 * - summarize, bottom-up: each chip from its code, each feature (per tier) from its chips, each tier from
 *   its features, the app from its tiers. Results go to repomap.ai.json with the hash of what was read,
 *   so a run only redoes what changed, and the board marks a summary stale once its code moves on.
 * - brief: a review briefing for a diff (what it does, where it lands, ripple effects, risks, tests)
 * - suggest rules: architecture rules in the config's format, from how the features actually connect
 */
import { tmpdir } from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { roleCovers, BOARD_HIDDEN_ROLES, SHARED_FEATURE, type RuleDef, type Summary } from '../../shared/board.ts'
import type { ReviewDiff } from '../../shared/review.ts'
import type { GraphNode, RepoGraph } from '../../shared/types.ts'
import { codeReader, readAiFile, summaryTargets, writeAiFile, type AiFile, type SummaryTarget } from '../board.ts'
import type { RepoMapConfig } from '../config.ts'
import type { Logger } from '../log.ts'
import { askClaudeCode } from './claude-code.ts'
import type { SettingsStore } from './settings.ts'

export interface BoardAiOptions {
  settings: SettingsStore
  /** Tests: the fake API. */
  baseURL?: string
  log?: Logger
  signal?: AbortSignal
}

export interface SummarizeProgress {
  phase: 'place' | 'chips' | 'features' | 'tiers' | 'done'
  done: number
  total: number
}

export interface SummarizeOptions extends BoardAiOptions {
  /** Rebuilds the graph (placements change features) and returns it. */
  rebuild(): Promise<RepoGraph>
  onProgress?(progress: SummarizeProgress): void
  /** At most this many chips per run (cost control); the rest next time. */
  limit?: number
  /** Also ask the AI to place chips nothing else placed (default true). */
  place?: boolean
}

export class BoardAiError extends Error {}

const CHIPS_PER_CALL = 10
const CODE_PER_CHIP = 6000
const CONCURRENCY = 4

/** One prompt to one answer, through the provider the settings pick. */
type Ask = (model: string, system: string, prompt: string, maxTokens: number, signal?: AbortSignal) => Promise<string>

/** Claude Code (the `claude` CLI, your subscription) or the API with a key. */
function asker(options: BoardAiOptions): Ask {
  const settings = options.settings.read()
  const problem = options.settings.notReady(settings)
  if (problem) throw new BoardAiError(problem)
  if (settings.provider === 'claude-code') {
    const binary = options.settings.claudeBinary()!
    const cwd = tmpdir()
    return (model, system, prompt, _maxTokens, signal) => askClaudeCode({ binary, model, system, prompt, cwd, signal })
  }
  const api = new Anthropic({ apiKey: options.settings.apiKey(settings)!, ...(options.baseURL ? { baseURL: options.baseURL } : {}), maxRetries: 3 })
  return async (model, system, prompt, maxTokens, signal) => {
    const message = await api.messages.stream({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }, { signal }).finalMessage()
    return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
  }
}

/** The JSON object or array in a reply (models sometimes wrap it in prose or a code fence). */
export function parseJsonReply<T>(text: string): T {
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (start < 0 || end < start) throw new BoardAiError('The reply had no JSON')
  return JSON.parse(text.slice(start, end + 1)) as T
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  })
  await Promise.all(runners)
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const SUMMARY_SYSTEM = `You write short summaries for an architecture map of a web app, read by its developer, who built it largely with an AI assistant and doesn't remember every part. Plain, concrete language: what the thing does, for whom, and how it fits (what it calls, what calls it, what data it touches). No filler ("This component…" is fine, "This is a well-structured…" is not). Never repeat the code. Reply with JSON only.`

/** Places, then summarizes what changed; returns how many summaries were written. */
export async function summarizeBoard(config: RepoMapConfig, options: SummarizeOptions): Promise<{ placed: number; written: number; failed: number; remaining: number }> {
  const ask = asker(options)
  const model = config.ai.summaryModel
  const progress = options.onProgress ?? (() => undefined)
  let graph = await options.rebuild()
  let placed = 0
  if (options.place !== false) {
    placed = await placeFeatures(config, graph, ask, model, options, progress)
    if (placed > 0) graph = await options.rebuild()
  }
  const ai = readAiFile(config.ai.file)
  const tiers = graph.board?.tiers ?? []
  const targets = summaryTargets(graph.nodes, tiers, codeReader(config.repoRoot))
  const due = (t: SummaryTarget) => ai.summaries[t.key]?.hash !== t.hash
  let failed = 0
  let written = 0
  const save = () => writeAiFile(config.ai.file, ai)
  const store = (key: string, hash: string, text: unknown) => {
    if (typeof text !== 'string' || !text.trim()) return
    const summary: Summary = { text: text.trim(), hash, model, at: new Date().toISOString() }
    ai.summaries[key] = summary
    written++
  }

  // Chips, from their code.
  const allChips = targets.filter((t) => t.level === 'chip' && due(t))
  const chips = options.limit !== undefined ? allChips.slice(0, options.limit) : allChips
  const remaining = allChips.length - chips.length
  const code = codeReader(config.repoRoot)
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const neighbours = neighbourLabels(graph)
  let done = 0
  progress({ phase: 'chips', done, total: chips.length })
  await pool(chunk(chips, CHIPS_PER_CALL), CONCURRENCY, async (batch) => {
    const items = batch.map((t) => {
      const node = t.node!
      const source = (code(node) ?? '').slice(0, CODE_PER_CHIP)
      return `### ${node.id}\nkind: ${node.kind} · feature: ${node.feature} · file: ${node.file ?? '?'}${node.description ? `\ndoc comment: ${node.description}` : ''}\nuses: ${neighbours.out.get(node.id)?.join(', ') || '-'}\nused by: ${neighbours.in.get(node.id)?.join(', ') || '-'}\n\`\`\`\n${source}\n\`\`\``
    })
    try {
      const reply = await ask(
        model,
        SUMMARY_SYSTEM,
        `Summarize each of these ${batch.length} parts of the app in 1–2 sentences (at most 45 words each).\nReply with a JSON object: {"<id after ###>": "summary", …}.\n\n${items.join('\n\n')}`,
        200 * batch.length + 400,
        options.signal,
      )
      const parsed = parseJsonReply<Record<string, string>>(reply)
      for (const t of batch) store(t.key, t.hash, parsed[t.key])
    } catch (error) {
      if (options.signal?.aborted) throw error
      failed += batch.length
      options.log?.warn(`summaries: ${(error as Error).message}`)
    }
    done += batch.length
    progress({ phase: 'chips', done, total: chips.length })
    save()
  })

  // Features (per tier), then tiers, then the app: from the summaries below them.
  const textOf = (key: string) => ai.summaries[key]?.text
  const labelOf = (key: string) => byId.get(key)?.label ?? key
  const featureLabel = (id: string) => graph.board?.features.find((f) => f.id === id)?.label ?? id
  const tierLabel = (id: string) => tiers.find((t) => t.id === id)?.label ?? id
  const features = targets.filter((t) => t.level === 'feature' && due(t) && remaining === 0)
  progress({ phase: 'features', done: 0, total: features.length })
  let featuresDone = 0
  await pool(chunk(features, 6), CONCURRENCY, async (batch) => {
    const items = batch.map((t) => {
      const parts = t.parts.map((p) => `- ${labelOf(p)} (${byId.get(p)?.kind}): ${textOf(p) ?? 'no summary'}`).slice(0, 80)
      return `### ${t.key}\n${featureLabel(t.feature!)} on the ${tierLabel(t.tier!)} tier, ${t.parts.length} parts:\n${parts.join('\n')}`
    })
    try {
      const reply = await ask(
        model,
        SUMMARY_SYSTEM,
        `Each block is one feature of the app on one tier, with its parts. Write 2–4 sentences per feature (at most 80 words): what it does for the user or admin, its main parts, and the data it reads or writes.\nReply with a JSON object: {"<key after ###>": "summary", …}.\n\n${items.join('\n\n')}`,
        350 * batch.length + 400,
        options.signal,
      )
      const parsed = parseJsonReply<Record<string, string>>(reply)
      for (const t of batch) store(t.key, t.hash, parsed[t.key])
    } catch (error) {
      if (options.signal?.aborted) throw error
      failed += batch.length
      options.log?.warn(`summaries: ${(error as Error).message}`)
    }
    featuresDone += batch.length
    progress({ phase: 'features', done: featuresDone, total: features.length })
    save()
  })

  const upper = targets.filter((t) => (t.level === 'tier' || t.level === 'app') && due(t) && remaining === 0)
  progress({ phase: 'tiers', done: 0, total: upper.length })
  for (const [k, t] of upper.entries()) {
    const parts = t.parts.map((p) => `- ${t.level === 'app' ? tierLabel(p.slice('tier:'.length)) : featureLabel(p.slice('feature:'.length).split('@')[0])}: ${textOf(p) ?? 'no summary'}`)
    const what = t.level === 'app' ? 'the whole app, from its tiers' : `the ${tierLabel(t.tier!)} tier, from its features`
    try {
      const reply = await ask(
        model,
        SUMMARY_SYSTEM,
        `Summarize ${what} in 3–5 sentences (at most 110 words): what it is, how it is organized, what flows through it.\nReply with a JSON object: {"summary": "…"}.\n\n${parts.join('\n')}`,
        800,
        options.signal,
      )
      store(t.key, t.hash, parseJsonReply<{ summary: string }>(reply).summary)
    } catch (error) {
      if (options.signal?.aborted) throw error
      failed++
      options.log?.warn(`summaries: ${(error as Error).message}`)
    }
    progress({ phase: 'tiers', done: k + 1, total: upper.length })
    save()
  }
  save()
  await options.rebuild()
  progress({ phase: 'done', done: written, total: written })
  return { placed, written, failed, remaining }
}

/** "Label (feature)" of each node's neighbours, both ways, for prompts. */
function neighbourLabels(graph: RepoGraph): { in: Map<string, string[]>; out: Map<string, string[]> } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const rootOf = (id: string) => {
    let node = byId.get(id)
    while (node?.parent && byId.has(node.parent)) node = byId.get(node.parent)
    return node
  }
  const add = (map: Map<string, Set<string>>, key: string, value: string) => (map.get(key) ?? map.set(key, new Set()).get(key)!).add(value)
  const inSets = new Map<string, Set<string>>()
  const outSets = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (edge.type === 'contains' || edge.type === 'tests' || edge.type === 'mocks') continue
    const from = rootOf(edge.from)
    const to = rootOf(edge.to)
    if (!from || !to || from === to) continue
    add(outSets, from.id, `${to.label} (${to.feature})`)
    add(inSets, to.id, `${from.label} (${from.feature})`)
  }
  const cap = (map: Map<string, Set<string>>) => new Map([...map].map(([k, v]) => [k, [...v].slice(0, 12)]))
  return { in: cap(inSets), out: cap(outSets) }
}

/** Asks where the chips nothing placed belong; returns how many it placed in a feature. */
async function placeFeatures(config: RepoMapConfig, graph: RepoGraph, ask: Ask, model: string, options: SummarizeOptions, progress: (p: SummarizeProgress) => void): Promise<number> {
  const ai: AiFile = readAiFile(config.ai.file)
  const features = (graph.board?.features ?? []).filter((f) => f.id !== SHARED_FEATURE)
  if (features.length === 0) return 0
  const candidates = graph.nodes.filter((n) => !n.parent && n.featureSource === 'shared' && !roleCovers(BOARD_HIDDEN_ROLES, n.role) && !ai.features[n.id] && n.kind !== 'file')
  if (candidates.length === 0) return 0
  const neighbours = neighbourLabels(graph)
  let placed = 0
  let done = 0
  progress({ phase: 'place', done, total: candidates.length })
  await pool(chunk(candidates, 40), CONCURRENCY, async (batch) => {
    const items = batch.map((n: GraphNode) => `- ${n.id} | ${n.kind} | ${n.file ?? ''} | uses: ${neighbours.out.get(n.id)?.slice(0, 6).join(', ') || '-'} | used by: ${neighbours.in.get(n.id)?.slice(0, 6).join(', ') || '-'}`)
    try {
      const reply = await ask(
        model,
        'You sort the parts of a web app into its features (vertical slices). A part used by several features, or by none in particular (UI kit, icons, infrastructure, app shell), stays "shared". Reply with JSON only.',
        `Features: ${features.map((f) => `${f.id} (${f.label})`).join(', ')}.\nFor each part below, give the one feature it belongs to, or "shared".\nReply with a JSON object: {"<id>": "<feature id or shared>", …}.\n\n${items.join('\n')}`,
        60 * batch.length + 300,
        options.signal,
      )
      const parsed = parseJsonReply<Record<string, string>>(reply)
      for (const node of batch) {
        const feature = parsed[node.id]
        if (typeof feature !== 'string') continue
        if (feature !== SHARED_FEATURE && !features.some((f) => f.id === feature)) continue
        ai.features[node.id] = { feature }
        if (feature !== SHARED_FEATURE) placed++
      }
    } catch (error) {
      if (options.signal?.aborted) throw error
      options.log?.warn(`placing features: ${(error as Error).message}`)
    }
    done += batch.length
    progress({ phase: 'place', done, total: candidates.length })
    writeAiFile(config.ai.file, ai)
  })
  // Answers of "shared" are kept too, so the same chips aren't asked about again.
  return placed
}

export interface BriefingInput {
  diff: ReviewDiff
  touched: string[]
  impacted: string[]
  tests: string[]
}

/** A review briefing (Markdown) for a diff, from the map and the patch. */
export async function reviewBriefing(config: RepoMapConfig, graph: RepoGraph, input: BriefingInput, options: BoardAiOptions): Promise<string> {
  const ask = asker(options)
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const summaries = graph.board?.summaries ?? {}
  const describe = (id: string) => {
    const node = byId.get(id)
    if (!node) return `- ${id}`
    const summary = summaries[id]?.text ?? node.description
    return `- ${node.label} (${node.kind}, ${node.feature}, ${node.file ?? '?'}${node.line ? `:${node.line}` : ''})${summary ? `: ${summary}` : ''}`
  }
  const violations = (graph.board?.violations ?? []).filter((v) => input.touched.includes(v.from) || input.touched.includes(v.to))
  const files = input.diff.files.map((f) => `- ${f.status} ${f.path} (+${f.added} −${f.removed})`)
  const prompt = [
    `Change under review: ${input.diff.label} (${input.diff.files.length} files)`,
    `## Files\n${files.join('\n')}`,
    `## Parts of the app it touches\n${input.touched.slice(0, 80).map(describe).join('\n') || '-'}`,
    `## Parts that depend on them (may be affected)\n${input.impacted.slice(0, 80).map(describe).join('\n') || '-'}`,
    `## Tests that cover them\n${input.tests.slice(0, 40).map(describe).join('\n') || 'none found'}`,
    violations.length ? `## Architecture rules these parts break\n${violations.map((v) => `- ${v.rule}: ${v.message}`).join('\n')}` : '',
    `## The diff${input.diff.truncated ? ' (cut short)' : ''}\n\`\`\`diff\n${input.diff.patch ?? ''}\n\`\`\``,
  ].filter(Boolean)
  return ask(config.ai.reviewModel,
    `You brief a developer before they review a change to their own web app. They built most of it with an AI assistant and don't remember every part, so connect the change to the system: say which features and tiers it lands in and what else it can affect. Be concrete and short; cite files as path:line. Write Markdown with these sections:\n## What it does\n## Where it lands\n## Ripple effects\n## Check carefully\n## Tests\n## Questions for the author\nUnder "Check carefully", list real risks you see in the diff (bugs, missing cases, security, data) — not style. Under "Tests", say which existing tests cover it and what is not covered.`,
    prompt.join('\n\n'),
    6000,
    options.signal,
  )
}

/** Rules the AI suggests for the config, from how features connect today (kept in repomap.ai.json). */
export async function suggestRules(config: RepoMapConfig, graph: RepoGraph, options: BoardAiOptions): Promise<RuleDef[]> {
  const ask = asker(options)
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const tiers = graph.board?.tiers ?? []
  const tierOf = new Map<string, string>()
  for (const tier of tiers) for (const layer of tier.layers) tierOf.set(layer, tier.id)
  const flows = new Map<string, number>()
  for (const edge of graph.edges) {
    if (edge.type === 'contains' || edge.type === 'uses-type') continue
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to || roleCovers(BOARD_HIDDEN_ROLES, from.role)) continue
    const key = `${from.layer}/${from.feature}/${from.kind} -${edge.type}-> ${to.layer}/${to.feature}/${to.kind}`
    flows.set(key, (flows.get(key) ?? 0) + 1)
  }
  const top = [...flows].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k, n]) => `${n}× ${k}`)
  const reply = await ask(config.ai.reviewModel,
    'You propose architecture rules for a web app, to be checked on every build so that code an AI assistant writes keeps to the architecture. Only propose rules the code mostly follows already (a rule broken everywhere is noise), each catching a mistake that matters. Reply with JSON only.',
    [
      `Tiers: ${tiers.map((t) => `${t.id} (layers ${t.layers.join(', ')})`).join('; ')}`,
      `Features: ${(graph.board?.features ?? []).map((f) => f.id).join(', ')}`,
      `Rules already in place: ${JSON.stringify(config.rules)}`,
      `Rule format (TypeScript): { id: string; description: string; severity?: 'error' | 'warn'; edgeTypes?: string[]; from?: Selector; to?: Selector; deny?: boolean; sameFeature?: boolean; allowFeatures?: string[] }, Selector = { tiers?, layers?, features?, kinds?, roles? } (string arrays). deny: every edge from→to is a violation. sameFeature: edges from→to must stay in one feature (shared and allowFeatures are exempt).`,
      `How the code connects today (count× layer/feature/kind -edge type-> layer/feature/kind):\n${top.join('\n')}`,
      'Propose up to 8 new rules. Reply with a JSON array of rules.',
    ].join('\n\n'),
    4000,
    options.signal,
  )
  const parsed = parseJsonReply<RuleDef[]>(reply)
  const rules = (Array.isArray(parsed) ? parsed : []).filter((r) => r && typeof r.id === 'string' && typeof r.description === 'string' && (r.deny || r.sameFeature))
  const ai = readAiFile(config.ai.file)
  ai.suggestedRules = rules
  writeAiFile(config.ai.file, ai)
  return rules
}
