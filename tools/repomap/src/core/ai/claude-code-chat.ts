/**
 * The chat assistant on the Claude Code provider: one message runs `claude -p` in the repository
 * (resuming the chat's Claude Code session), and its stream-json output becomes the chat's events —
 * text and thinking as they stream, each tool as a step, edited files announced so the map and open
 * editors catch up. Claude Code runs its own tools; the permission mode decides which it may use
 * (headless, it can't ask: a tool it may not use is declined and shown as such).
 */
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { ChatEvent, ChatItem, Effort, PermissionMode, ToolClass, ToolStep } from '../../shared/ai.ts'
import { TOOL_ROOT } from '../config.ts'
import { runClaude } from './claude-code.ts'
import { truncate } from './tools.ts'

const UI_OUTPUT = 6000
const READ_TOOLS = ['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'TodoWrite']
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** How repomap's own map lookup is run (the only shell command allowed in every mode). */
export function mapQueryCommand(): string {
  return `node ${join(TOOL_ROOT, 'src', 'cli.ts')} map-query`
}

/** Claude Code's permission mode and allowed tools for repomap's modes. */
export function permissionArgs(mode: PermissionMode): string[] {
  const allowed = [...READ_TOOLS, `Bash(${mapQueryCommand()}:*)`]
  if (mode === 'auto') allowed.push('Bash')
  return ['--permission-mode', mode === 'ask' ? 'default' : 'acceptEdits', '--allowedTools', ...allowed]
}

/** Appended to Claude Code's own system prompt: where it runs, and repomap's map and board. */
export function claudeCodeSystemPrompt(repoName: string): string {
  return [
    `You are running inside repomap (an architecture map, Board and git client) for the repository "${repoName}"; the user reads your answers in repomap's chat dock.`,
    'Their messages may start with a <context> block: what they are looking at (the selected node or chip, the open file and selection, a commit, the uncommitted changes). Use it to understand what "this" or "here" means.',
    `To look things up in the architecture map (what calls what across frontend, backend and database), run \`${mapQueryCommand()} <words>\` or \`${mapQueryCommand()} --node <id or exact name>\`.`,
    'To point at parts of the app on the Board (features → chips → pins), end your answer with one line: `show-on-board: <node id or exact name>, <another>` - the board opens on them.',
  ].join('\n')
}

export interface TurnOptions {
  binary: string
  root: string
  prompt: string
  model: string
  effort?: Effort
  mode: PermissionMode
  /** The chat's Claude Code session, to continue it. */
  resume?: string
  system: string
  signal: AbortSignal
}

export interface TurnHooks {
  emit(event: ChatEvent): void
  record(item: ChatItem): void
  update(step: ToolStep): void
  notice(level: 'info' | 'warn' | 'error', text: string): void
  filesChanged(paths: string[]): void
}

/** Runs one message; resolves with the session id (for the next message) and why it stopped. */
export async function claudeCodeTurn(options: TurnOptions, hooks: TurnHooks): Promise<{ sessionId?: string; stopReason: string }> {
  let sessionId: string | undefined
  let stopReason = 'end_turn'
  let assistant: Extract<ChatItem, { type: 'assistant' }> | null = null
  let model: string | undefined
  let lastText = ''
  const steps = new Map<string, ToolStep>()
  const edited = new Map<string, string>()
  // Claude Code reports real paths (macOS: /private/var for /var): relative to the root either way.
  const roots = [options.root, safeRealpath(options.root)]
  const rel = (path: unknown) => {
    if (typeof path !== 'string') return ''
    if (!isAbsolute(path)) return path
    const root = roots.find((r) => path === r || path.startsWith(`${r}${sep}`))
    return root ? relative(root, path) || path : path
  }
  const ensureAssistant = () => {
    if (!assistant) {
      assistant = { type: 'assistant', id: randomUUID(), text: '', ...(model ? { model } : {}) }
      hooks.record(assistant)
      if (model) hooks.emit({ type: 'model', itemId: assistant.id, model })
    }
    return assistant
  }
  const onLine = (line: Record<string, unknown>) => {
    if (typeof line.session_id === 'string') sessionId = line.session_id
    // Steps of a subagent stay inside its own tool step.
    if (line.parent_tool_use_id) return
    if (line.type === 'stream_event') {
      const event = line.event as { type: string; message?: { model?: string }; content_block?: { type: string; id?: string; name?: string }; delta?: { type: string; text?: string; thinking?: string } }
      if (event.type === 'message_start') model = event.message?.model ?? model
      else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use' && event.content_block.id) {
        const name = event.content_block.name ?? 'tool'
        const step: ToolStep = { id: event.content_block.id, name, class: classOf(name), title: name, input: {}, status: 'running' }
        steps.set(step.id, step)
        hooks.update(step)
        hooks.emit({ type: 'tool', step: { ...step } })
        assistant = null
      } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
        const item = ensureAssistant()
        item.text += event.delta.text
        lastText = item.text
        hooks.emit({ type: 'text', itemId: item.id, text: event.delta.text })
      } else if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta' && event.delta.thinking) {
        const item = ensureAssistant()
        item.thinking = (item.thinking ?? '') + event.delta.thinking
        hooks.emit({ type: 'thinking', itemId: item.id, text: event.delta.thinking })
      }
      return
    }
    if (line.type === 'assistant') {
      const content = ((line.message as { content?: unknown[] })?.content ?? []) as { type: string; id?: string; name?: string; input?: Record<string, unknown> }[]
      for (const block of content) {
        if (block.type !== 'tool_use' || !block.id) continue
        const step = steps.get(block.id) ?? { id: block.id, name: block.name ?? 'tool', class: classOf(block.name ?? ''), title: '', input: {}, status: 'running' as const }
        const input = block.input ?? {}
        step.input = input
        step.title = titleOf(step.name, input, rel)
        steps.set(step.id, step)
        if (EDIT_TOOLS.has(step.name)) {
          const path = rel(input.file_path ?? input.notebook_path)
          if (path) edited.set(step.id, path)
        }
        hooks.update(step)
        hooks.emit({ type: 'tool', step: { ...step } })
      }
      return
    }
    if (line.type === 'user') {
      const content = ((line.message as { content?: unknown })?.content ?? []) as unknown
      if (!Array.isArray(content)) return
      for (const block of content as { type: string; tool_use_id?: string; is_error?: boolean; content?: unknown }[]) {
        if (block.type !== 'tool_result' || !block.tool_use_id) continue
        const step = steps.get(block.tool_use_id)
        if (!step) continue
        const output = resultText(block.content)
        const declined = block.is_error && /permission|haven't granted|not allowed|denied/i.test(output)
        step.status = declined ? 'denied' : block.is_error ? 'error' : 'done'
        step.output = truncate(declined ? `${output}\n(Allow more in Settings → "Without asking, Claude may".)` : output, UI_OUTPUT)
        hooks.update(step)
        hooks.emit({ type: 'tool', step: { ...step } })
        const path = edited.get(step.id)
        if (path && step.status === 'done') {
          hooks.filesChanged([path])
          hooks.emit({ type: 'files', paths: [path] })
        }
      }
      return
    }
    if (line.type === 'result') {
      const usage = line.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | undefined
      if (usage) hooks.emit({ type: 'usage', inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0, cacheReadTokens: usage.cache_read_input_tokens ?? 0 })
      stopReason = typeof line.stop_reason === 'string' ? line.stop_reason : String(line.subtype ?? 'end_turn')
      if (line.is_error) {
        hooks.notice('error', typeof line.result === 'string' && line.result ? line.result : `Claude Code stopped (${String(line.subtype ?? 'error')}).`)
        stopReason = 'error'
      }
    }
  }
  await runClaude({
    binary: options.binary,
    prompt: options.prompt,
    cwd: options.root,
    signal: options.signal,
    onLine,
    args: [
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', options.model,
      ...(options.effort ? ['--effort', options.effort] : []),
      ...(options.resume ? ['--resume', options.resume] : []),
      '--append-system-prompt', options.system,
      // Last: it takes every argument after it.
      ...permissionArgs(options.mode),
    ],
  })
  // "show-on-board: a, b" at the end of the answer: the board opens on them (as the API provider's tool does).
  const board = /^show-on-board:\s*(.+)$/im.exec(lastText)
  if (board) {
    const nodes = board[1].split(',').map((n) => n.trim().replace(/^`|`$/g, '')).filter(Boolean)
    const step: ToolStep = { id: randomUUID(), name: 'show_on_board', class: 'read', title: `Show ${nodes.length === 1 ? nodes[0] : `${nodes.length} parts`} on the board`, input: { nodes }, status: 'done' }
    hooks.update(step)
    hooks.emit({ type: 'tool', step })
  }
  return { sessionId, stopReason }
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function classOf(name: string): ToolClass {
  if (EDIT_TOOLS.has(name)) return 'edit'
  if (name === 'Bash') return 'shell'
  return 'read'
}

function titleOf(name: string, input: Record<string, unknown>, rel: (path: unknown) => string): string {
  const s = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const short = (text: string) => (text.length > 90 ? `${text.slice(0, 89)}…` : text)
  switch (name) {
    case 'Read':
      return `Read ${rel(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `Edit ${rel(input.file_path)}`
    case 'Write':
      return `Write ${rel(input.file_path)}`
    case 'NotebookEdit':
      return `Edit ${rel(input.notebook_path)}`
    case 'Bash':
      return `Run ${short(s('command').split('\n')[0])}`
    case 'Grep':
      return `Search for “${short(s('pattern'))}”${s('path') ? ` in ${rel(input.path)}` : ''}`
    case 'Glob':
      return `Find ${short(s('pattern'))}`
    case 'WebFetch':
      return `Read ${short(s('url'))}`
    case 'WebSearch':
      return `Search the web for “${short(s('query'))}”`
    case 'Task':
    case 'Agent':
      return `Agent: ${short(s('description') || s('prompt'))}`
    case 'TodoWrite':
      return 'Update the plan'
    default:
      return name
  }
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text) : '')).join('\n')
  return ''
}
