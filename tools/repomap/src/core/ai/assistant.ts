/**
 * The assistant: a Claude agent working in the served repository. One message from the chat runs a
 * loop - stream Claude's answer, run the tools it asks for (asking the user first when the permission
 * mode says so), send the results back - until Claude is done, the user stops it, or it declines.
 *
 * The message history is only ever appended to (thinking blocks stay valid, the prompt cache keeps
 * hitting). Every tool_use gets a tool_result, even when it doesn't run (declined, stopped, invalid),
 * so a chat can always continue.
 */
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import {
  allowedWithoutAsking,
  DEFAULT_MODEL,
  EFFORTS,
  type AiModel,
  type ApprovalDecision,
  type ChatEvent,
  type ChatItem,
  type ContextItem,
  type Effort,
  type PermissionMode,
  type ToolClass,
  type ToolStep,
} from '../../shared/ai.ts'
import type { RepoGraph } from '../../shared/types.ts'
import { ConversationStore, summary, type StoredConversation } from './conversations.ts'
import { SettingsStore } from './settings.ts'
import { ShellSession } from './shell.ts'
import { planCall, toolDefinitions, ToolInputError, truncate, type ToolContext } from './tools.ts'

type ContentBlock = Anthropic.Beta.BetaContentBlock
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam

/** Models that take `fallbacks: "default"` (a declined request is retried on another model). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'])
const MAX_STEPS = 80
const UI_OUTPUT = 6000

export interface AssistantOptions {
  root: () => string
  graph: () => RepoGraph | undefined
  settings: SettingsStore
  conversations: ConversationStore
  /** Files changed (rebuild the map; the viewer reloads open files). */
  filesChanged: (paths: string[]) => void
  gitChanged: () => Promise<void>
  /** Tests point this at a fake API. */
  baseURL?: string
}

export interface SendRequest {
  conversationId?: string
  text: string
  context?: ContextItem[]
  model?: string
  effort?: Effort
  mode?: PermissionMode
}

export class AssistantError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface Capabilities {
  adaptiveThinking: boolean
  efforts: Effort[]
  maxOutput: number
  webTools: boolean
}

interface Running {
  controller: AbortController
  approvals: Map<string, (decision: ApprovalDecision) => void>
}

export class Assistant {
  private readonly options: AssistantOptions
  private readonly running = new Map<string, Running>()
  private readonly shells = new Map<string, ShellSession>()
  private readonly capabilities = new Map<string, Capabilities>()

  constructor(options: AssistantOptions) {
    this.options = options
  }

  private client(): Anthropic {
    const apiKey = this.options.settings.apiKey()
    if (!apiKey) throw new AssistantError(412, 'Add an Anthropic API key in Settings first.')
    return new Anthropic({ apiKey, ...(this.options.baseURL ? { baseURL: this.options.baseURL } : {}), maxRetries: 2 })
  }

  async models(): Promise<AiModel[]> {
    const client = this.client()
    const models: AiModel[] = []
    try {
      for await (const model of client.beta.models.list({ limit: 100 })) {
        const caps = model.capabilities
        const efforts = caps?.effort?.supported ? EFFORTS.filter((level) => (caps.effort as unknown as Record<string, { supported?: boolean }>)[level]?.supported) : []
        models.push({ id: model.id, name: model.display_name, contextWindow: model.max_input_tokens, maxOutput: model.max_tokens, efforts })
        if (caps) {
          this.capabilities.set(model.id, {
            adaptiveThinking: !!caps.thinking?.types?.adaptive?.supported,
            efforts,
            maxOutput: model.max_tokens ?? 64_000,
            webTools: !/haiku|claude-3/.test(model.id),
          })
        }
      }
    } catch (error) {
      throw apiError(error)
    }
    return models
  }

  conversation(id: string): StoredConversation | undefined {
    return this.options.conversations.get(id)
  }

  isRunning(id: string): boolean {
    return this.running.has(id)
  }

  approve(conversationId: string, toolId: string, decision: ApprovalDecision): boolean {
    const resolveApproval = this.running.get(conversationId)?.approvals.get(toolId)
    if (!resolveApproval) return false
    resolveApproval(decision)
    return true
  }

  stop(conversationId: string): boolean {
    const run = this.running.get(conversationId)
    if (!run) return false
    run.controller.abort()
    return true
  }

  /** Runs one user message to the end, reporting every step through `emit`. */
  async send(request: SendRequest, emit: (event: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
    const text = typeof request.text === 'string' ? request.text.trim() : ''
    if (!text) throw new AssistantError(400, 'Write a message.')
    const settings = this.options.settings.read()
    const client = this.client()
    const store = this.options.conversations
    let conversation = request.conversationId ? store.get(request.conversationId) : undefined
    if (request.conversationId && !conversation) throw new AssistantError(404, 'That chat no longer exists.')
    if (conversation && this.running.has(conversation.id)) throw new AssistantError(409, 'The assistant is still working on this chat.')
    const model = request.model || conversation?.model || settings.model || DEFAULT_MODEL
    conversation ??= store.create(model, systemPrompt(this.options.root(), this.options.graph()))
    conversation.model = model
    if (conversation.title === 'New chat') conversation.title = text.split('\n')[0].slice(0, 70)

    const run: Running = { controller: new AbortController(), approvals: new Map() }
    const abort = () => run.controller.abort()
    signal?.addEventListener('abort', abort)
    this.running.set(conversation.id, run)

    const record = (item: ChatItem) => {
      conversation!.items.push(item)
    }
    const update = (step: ToolStep) => {
      const item = conversation!.items.find((i) => i.type === 'tool' && i.id === step.id)
      if (item && item.type === 'tool') item.step = { ...step }
      else record({ type: 'tool', id: step.id, step: { ...step } })
    }
    const notice = (level: 'info' | 'warn' | 'error', noticeText: string) => {
      const item = { type: 'notice' as const, id: randomUUID(), level, text: noticeText }
      record(item)
      emit({ type: 'notice', item })
    }

    const context = sanitizeContext(request.context)
    const user: ChatItem = { type: 'user', id: randomUUID(), text, context }
    record(user)
    conversation.messages.push({ role: 'user', content: [{ type: 'text', text: userMessage(text, context) }] })
    store.save(conversation)
    emit({ type: 'start', conversation: summary(conversation), user })

    const mode = request.mode ?? settings.permissionMode
    const effort = request.effort ?? settings.effort
    let stopReason = 'end_turn'
    try {
      const caps = await this.capabilitiesOf(client, model)
      const tools = toolDefinitions({ webTools: caps.webTools })
      const toolContext = this.toolContext(conversation.id)
      let jsonRetries = 0
      for (let step = 0; ; step++) {
        if (step >= MAX_STEPS) {
          notice('warn', `Stopped after ${MAX_STEPS} steps. Say "continue" to let it go on.`)
          stopReason = 'max_steps'
          break
        }
        const params: Anthropic.Beta.MessageCreateParamsStreaming = {
          model,
          max_tokens: Math.min(64_000, caps.maxOutput),
          system: [{ type: 'text', text: conversation.system, cache_control: { type: 'ephemeral' } }],
          tools,
          messages: conversation.messages,
          // The conversation tail is cached too: each step re-sends the whole history.
          cache_control: { type: 'ephemeral' },
          stream: true,
          ...(caps.adaptiveThinking ? { thinking: { type: 'adaptive', display: 'summarized' } } : {}),
          ...(caps.efforts.length ? { output_config: { effort: nearestEffort(effort, caps.efforts) } } : {}),
          // A request declined by the safety classifiers is retried on the recommended model, in the same call.
          ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        }
        let message: Anthropic.Beta.BetaMessage
        try {
          message = await this.stream(client, params, run.controller.signal, emit, record, update)
          jsonRetries = 0
        } catch (error) {
          if (run.controller.signal.aborted) {
            stopReason = 'stopped'
            break
          }
          // A tool input that isn't valid JSON (streamed as generated): ask again, a couple of times.
          if (!(error instanceof Anthropic.APIError) && error instanceof SyntaxError && jsonRetries++ < 2) continue
          throw error
        }
        emit({ type: 'usage', inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, cacheReadTokens: message.usage.cache_read_input_tokens ?? 0 })

        const content = echoable(message.content)
        conversation.messages.push({ role: 'assistant', content: content as Anthropic.Beta.BetaContentBlockParam[] })
        const toolUses = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
        stopReason = message.stop_reason ?? 'end_turn'

        if (message.stop_reason === 'refusal') {
          notice('warn', `Claude declined to continue${message.stop_details?.category ? ` (${message.stop_details.category})` : ''}. Rephrase the request, or pick another model.`)
          this.answerAll(conversation, toolUses, 'Not run: the response was declined.')
          break
        }
        if (message.stop_reason === 'max_tokens' && toolUses.length > 0) {
          notice('warn', 'The response was cut off at the length limit before a tool call was complete. Ask for smaller steps.')
          this.answerAll(conversation, toolUses, 'Not run: the tool input was cut off by the length limit. Split the change into smaller edits.')
          break
        }
        if (message.stop_reason === 'pause_turn') continue
        if (toolUses.length === 0) {
          if (message.stop_reason === 'max_tokens') notice('warn', 'The answer was cut off at the length limit.')
          break
        }

        const results: ToolResult[] = []
        for (const use of toolUses) {
          if (run.controller.signal.aborted) {
            results.push(result(use.id, 'Not run: the user stopped the assistant.', true))
            continue
          }
          results.push(await this.runTool(use, conversation, mode, run, toolContext, emit, update))
        }
        conversation.messages.push({ role: 'user', content: results })
        store.save(conversation)
        if (run.controller.signal.aborted) {
          stopReason = 'stopped'
          break
        }
      }
    } catch (error) {
      const failure = apiError(error)
      notice('error', failure.message)
      stopReason = 'error'
    } finally {
      signal?.removeEventListener('abort', abort)
      this.running.delete(conversation.id)
      if (stopReason === 'stopped') notice('info', 'Stopped.')
      store.save(conversation)
      emit({ type: 'done', stopReason })
    }
  }

  /** Streams one response to the chat; resolves with the complete message. */
  private async stream(
    client: Anthropic,
    params: Anthropic.Beta.MessageCreateParamsStreaming,
    signal: AbortSignal,
    emit: (event: ChatEvent) => void,
    record: (item: ChatItem) => void,
    update: (step: ToolStep) => void,
  ): Promise<Anthropic.Beta.BetaMessage> {
    const { stream: _stream, ...body } = params
    const stream = client.beta.messages.stream(body, { signal })
    let assistant: Extract<ChatItem, { type: 'assistant' }> | null = null
    let model: string | undefined
    // A paragraph of the answer, created when its first words arrive (no empty bubbles before a tool call).
    const ensureAssistant = () => {
      if (!assistant) {
        assistant = { type: 'assistant', id: randomUUID(), text: '', ...(model ? { model } : {}) }
        record(assistant)
        if (model) emit({ type: 'model', itemId: assistant.id, model })
      }
      return assistant
    }
    for await (const event of stream) {
      if (event.type === 'message_start') {
        model = event.message.model
      } else if (event.type === 'content_block_start') {
        const block = event.content_block
        if (block.type === 'tool_use' || block.type === 'server_tool_use') {
          const step: ToolStep = { id: block.id, name: block.name, class: block.type === 'server_tool_use' ? 'read' : classOf(block.name), title: titleWhileStreaming(block.name), input: {}, status: 'running' }
          update(step)
          emit({ type: 'tool', step })
          // Text after a tool call is a new paragraph in the chat.
          assistant = null
        } else if (block.type === 'fallback') {
          const item = { type: 'notice' as const, id: randomUUID(), level: 'info' as const, text: `${block.from.model} declined; ${block.to.model} continued.` }
          record(item)
          emit({ type: 'notice', item })
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const item = ensureAssistant()
          item.text += event.delta.text
          emit({ type: 'text', itemId: item.id, text: event.delta.text })
        } else if (event.delta.type === 'thinking_delta') {
          const item = ensureAssistant()
          item.thinking = (item.thinking ?? '') + event.delta.thinking
          emit({ type: 'thinking', itemId: item.id, text: event.delta.thinking })
        }
      }
    }
    const message = await stream.finalMessage()
    // Web searches and fetches ran on Anthropic's side: mark them done.
    for (const block of message.content) {
      if (block.type === 'server_tool_use') {
        const step: ToolStep = { id: block.id, name: block.name, class: 'read', title: serverToolTitle(block.name, block.input), input: block.input, status: 'done' }
        update(step)
        emit({ type: 'tool', step })
      }
    }
    return message
  }

  private async runTool(
    use: Anthropic.Beta.BetaToolUseBlock,
    conversation: StoredConversation,
    mode: PermissionMode,
    run: Running,
    context: ToolContext,
    emit: (event: ChatEvent) => void,
    update: (step: ToolStep) => void,
  ): Promise<ToolResult> {
    const step: ToolStep = { id: use.id, name: use.name, class: classOf(use.name), title: use.name, input: use.input, status: 'running' }
    let planned
    try {
      planned = planCall(use.name, use.input, context)
    } catch (error) {
      const reason = error instanceof ToolInputError ? error.message : `Could not run ${use.name}: ${(error as Error).message}`
      Object.assign(step, { status: 'error', output: reason, title: titleWhileStreaming(use.name) })
      update(step)
      emit({ type: 'tool', step })
      return result(use.id, reason, true)
    }
    Object.assign(step, { class: planned.class, title: planned.title, diff: planned.diff })

    if (!allowedWithoutAsking(mode, planned.class) && !conversation.allowed.includes(planned.class)) {
      step.status = 'waiting'
      update(step)
      emit({ type: 'approval', step: { ...step } })
      this.options.conversations.save(conversation)
      const decision = await new Promise<ApprovalDecision | 'stopped'>((resolveDecision) => {
        run.approvals.set(use.id, resolveDecision)
        const onAbort = () => resolveDecision('stopped')
        if (run.controller.signal.aborted) onAbort()
        run.controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      run.approvals.delete(use.id)
      if (decision === 'stopped' || decision === 'deny') {
        step.status = 'denied'
        step.output = decision === 'stopped' ? 'Stopped.' : 'Declined.'
        update(step)
        emit({ type: 'tool', step })
        return result(use.id, decision === 'stopped' ? 'Not run: the user stopped the assistant.' : 'The user declined this action. Ask what they want instead, or try another way.', true)
      }
      if (decision === 'always' && !conversation.allowed.includes(planned.class)) conversation.allowed.push(planned.class)
    }

    step.status = 'running'
    update(step)
    emit({ type: 'tool', step: { ...step } })
    try {
      const outcome = await planned.run()
      step.status = outcome.isError ? 'error' : 'done'
      step.output = truncate(outcome.display ?? outcome.content, UI_OUTPUT)
      if (outcome.diff) step.diff = outcome.diff
      update(step)
      emit({ type: 'tool', step })
      if (outcome.changed?.length) {
        context.filesChanged(outcome.changed)
        emit({ type: 'files', paths: outcome.changed })
      }
      return result(use.id, truncate(outcome.content), outcome.isError)
    } catch (error) {
      const reason = error instanceof ToolInputError ? error.message : `The tool failed: ${(error as Error).message}`
      step.status = 'error'
      step.output = reason
      update(step)
      emit({ type: 'tool', step })
      return result(use.id, reason, true)
    }
  }

  /** Tool calls that won't run still need an answer, or the chat can't continue. */
  private answerAll(conversation: StoredConversation, uses: Anthropic.Beta.BetaToolUseBlock[], reason: string): void {
    if (uses.length) conversation.messages.push({ role: 'user', content: uses.map((use) => result(use.id, reason, true)) })
  }

  private toolContext(conversationId: string): ToolContext {
    let shell = this.shells.get(conversationId)
    if (!shell) {
      shell = new ShellSession(this.options.root())
      this.shells.set(conversationId, shell)
    }
    return {
      root: this.options.root(),
      graph: this.options.graph,
      shell,
      filesChanged: this.options.filesChanged,
      gitChanged: this.options.gitChanged,
    }
  }

  private async capabilitiesOf(client: Anthropic, model: string): Promise<Capabilities> {
    const known = this.capabilities.get(model)
    if (known) return known
    let caps: Capabilities = guessCapabilities(model)
    try {
      const info = await client.beta.models.retrieve(model)
      const c = info.capabilities
      if (c) {
        caps = {
          adaptiveThinking: !!c.thinking?.types?.adaptive?.supported,
          efforts: c.effort?.supported ? EFFORTS.filter((level) => (c.effort as unknown as Record<string, { supported?: boolean }>)[level]?.supported) : [],
          maxOutput: info.max_tokens ?? caps.maxOutput,
          webTools: caps.webTools,
        }
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw error
      if (error instanceof Anthropic.NotFoundError) throw new AssistantError(400, `The model ${model} does not exist (or this key can't use it). Pick another one.`)
      // Otherwise go by the model's name.
    }
    this.capabilities.set(model, caps)
    return caps
  }

  closeAll(): void {
    for (const run of this.running.values()) run.controller.abort()
    for (const shell of this.shells.values()) shell.close()
    this.shells.clear()
  }
}

// ---------------------------------------------------------------- helpers

export function systemPrompt(root: string, graph: RepoGraph | undefined): string {
  const layers = graph?.meta.layers.map((l) => `${l.label}${l.description ? ` (${l.description})` : ''}`).join('; ')
  return [
    `You are an AI coding assistant built into repomap - a 3D architecture map, git client and code editor - for the repository "${graph?.meta.repo.name ?? 'repository'}" at ${root}.`,
    'The user talks to you from a chat dock while looking at the map, a file in the editor, or the git history. Each of their messages may start with a <context> block: what they are looking at right now (the selected node of the map, the open file and their selection, a commit, the uncommitted changes). Use it to understand what "this", "here" or "it" means.',
    '',
    'You work directly in their working copy:',
    '- str_replace_based_edit_tool: view files and folders, create files, str_replace, insert. Paths are relative to the repository root.',
    '- bash: a persistent shell in the repository root (no interactive input; commands stop after 2 minutes).',
    '- search_code and find_files: find code and files before reading them.',
    '- map_query: the architecture map - what calls what across the layers (page → API call → endpoint → service → table).',
    '- git_info (read-only) and git_command (commit, branches, merge, push… - only when asked).',
    '- manage_files: delete, rename or move files and folders.',
    '- web_search and web_fetch (when available) for current documentation.',
    '',
    'The user sees every step; changes may wait for their approval. Read the relevant code before changing it, keep changes to what was asked, and match the style of the code around them. After changing code, check it (a type check or the tests) when the repository has a quick way to. Do not commit, push, delete branches or discard work unless the user asks. The map rebuilds by itself after files change.',
    'Answer in the language the user writes in. Be brief: say what you did or found, reference code as path:line, use Markdown.',
    layers ? `\nThe map's layers (top to bottom): ${layers}.` : '',
  ]
    .join('\n')
    .trim()
}

function userMessage(text: string, context: ContextItem[]): string {
  if (context.length === 0) return text
  const blocks = context.map((item) => `<${item.kind} label="${item.label.replace(/"/g, "'")}">\n${item.text}\n</${item.kind}>`)
  return `<context>\n${blocks.join('\n')}\n</context>\n\n${text}`
}

function sanitizeContext(context: unknown): ContextItem[] {
  if (!Array.isArray(context)) return []
  return context
    .filter((item): item is ContextItem => !!item && typeof item === 'object' && typeof item.kind === 'string' && typeof item.label === 'string' && typeof item.text === 'string')
    .slice(0, 8)
    .map((item) => ({ kind: item.kind.replace(/[^a-z-]/gi, '').slice(0, 30) || 'context', label: item.label.slice(0, 200), text: item.text.slice(0, 40_000) }))
}

/**
 * The response as it goes back into the history. After a fallback mid-answer, the declined model's
 * thinking and unfinished tool calls before the last fallback marker are left out (their results
 * never come); everything else is kept exactly, marker included.
 */
export function echoable(content: ContentBlock[]): ContentBlock[] {
  const last = content.map((b) => b.type).lastIndexOf('fallback')
  if (last < 0) return content
  const resultIds = new Set(content.filter((b) => 'tool_use_id' in b).map((b) => (b as { tool_use_id: string }).tool_use_id))
  return content.filter((block, i) => {
    if (i >= last) return true
    if (block.type === 'thinking' || block.type === 'redacted_thinking' || block.type === 'tool_use') return false
    if (block.type === 'server_tool_use') return resultIds.has(block.id)
    return block.type === 'text' || 'tool_use_id' in block
  })
}

function result(id: string, content: string, isError = false): ToolResult {
  return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }
}

function classOf(name: string): ToolClass {
  if (name === 'bash') return 'shell'
  if (name === 'git_command') return 'git'
  if (name === 'manage_files') return 'edit'
  return 'read'
}

function titleWhileStreaming(name: string): string {
  const titles: Record<string, string> = {
    str_replace_based_edit_tool: 'Editor',
    bash: 'Shell command',
    search_code: 'Searching the code',
    find_files: 'Finding files',
    map_query: 'Looking in the map',
    git_info: 'Reading git',
    git_command: 'git',
    manage_files: 'Files',
    web_search: 'Searching the web',
    web_fetch: 'Reading a web page',
  }
  return titles[name] ?? name
}

function serverToolTitle(name: string, input: unknown): string {
  const args = (input ?? {}) as { query?: string; url?: string }
  if (name === 'web_search' && args.query) return `Search the web for “${args.query}”`
  if (name === 'web_fetch' && args.url) return `Read ${args.url}`
  return titleWhileStreaming(name)
}

function nearestEffort(wanted: Effort, supported: Effort[]): Effort {
  if (supported.includes(wanted)) return wanted
  const order = EFFORTS
  for (let i = order.indexOf(wanted); i >= 0; i--) if (supported.includes(order[i])) return order[i]
  return supported[0]
}

/** When the Models API can't say: by the model's name. */
function guessCapabilities(model: string): Capabilities {
  const legacy = /haiku|claude-3|sonnet-4-5|sonnet-4-0|opus-4-[015]\b|opus-4-1/.test(model)
  return {
    adaptiveThinking: !legacy,
    efforts: legacy ? [] : /opus-4-6|sonnet-4-6/.test(model) ? ['low', 'medium', 'high', 'max'] : EFFORTS,
    maxOutput: /haiku/.test(model) ? 64_000 : 128_000,
    webTools: !/haiku|claude-3/.test(model),
  }
}

/** An API failure, as the chat should say it. */
export function apiError(error: unknown): AssistantError {
  if (error instanceof AssistantError) return error
  if (error instanceof Anthropic.AuthenticationError) return new AssistantError(401, 'The API key was not accepted. Check it in Settings.')
  if (error instanceof Anthropic.PermissionDeniedError) return new AssistantError(403, 'This API key may not use that model or feature.')
  if (error instanceof Anthropic.NotFoundError) return new AssistantError(404, 'The model was not found. Pick another one in the chat or in Settings.')
  if (error instanceof Anthropic.RateLimitError) return new AssistantError(429, 'Rate limited by the API. Wait a moment and try again.')
  if (error instanceof Anthropic.BadRequestError) return new AssistantError(400, `The API refused the request: ${error.message}`)
  if (error instanceof Anthropic.InternalServerError) return new AssistantError(502, 'The API is overloaded or failing right now. Try again shortly.')
  if (error instanceof Anthropic.APIConnectionError) return new AssistantError(502, 'Could not reach the Anthropic API. Check the connection.')
  if (error instanceof Anthropic.APIError) return new AssistantError(error.status ?? 500, error.message)
  return new AssistantError(500, (error as Error)?.message ?? String(error))
}

