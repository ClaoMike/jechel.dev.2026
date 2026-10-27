/**
 * The writing side of `repomap serve`: saving files from the code panel and running git commands
 * from the History tab.
 *
 *   GET  /api/info        { writable: true, ai } (a read-only server answers false: the viewer asks this first)
 *   PUT  /source?path=…   save a file of the graph (If-Match: the ETag it was opened with)
 *   GET  /api/git/state   branch, upstream, changed files, stashes, merge/rebase in progress
 *   GET  /api/files       the repository's files (as git lists them: ignored ones left out)
 *   GET  /api/files/classify?path=…   the layer and role a (new) file would get
 *   POST /api/files       create / delete / rename a file or folder (JSON FileOperation)
 *   /api/ai/…             the assistant: settings, models, chats, a message (streamed), approvals, stop
 *   POST /api/git         run one GitAction (JSON)
 *   GET  /api/board/ai    the Board's AI job (summaries): running, progress, last result
 *   POST /api/board/summarize · /api/board/stop · /api/board/briefing · /api/board/suggest-rules
 *
 * (GET /api/review, the read-only diff for review mode, is served by serve.ts on every server.)
 *
 * Only served when enabled (by default: `repomap serve` of your own repository on a loopback
 * address). Every request must come from the viewer itself: a loopback Host (no DNS rebinding), the
 * same Origin when the browser sends one, and the X-Repomap-Request header, which a page on another
 * site cannot add without a CORS preflight, and the server never grants one.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AiSettingsUpdate, ApprovalDecision, ChatEvent } from '../shared/ai.ts'
import { WRITE_HEADER, type GitAction } from '../shared/git-actions.ts'
import type { RepoGraph } from '../shared/types.ts'
import { BoardAiError, reviewBriefing, suggestRules, summarizeBoard, type BriefingInput, type SummarizeProgress } from './ai/board-ai.ts'
import type { RepoMapConfig } from './config.ts'
import { readReviewDiff, ReviewError } from './review.ts'
import { apiError, AssistantError, type Assistant, type SendRequest } from './ai/assistant.ts'
import { publicConversation, type ConversationStore } from './ai/conversations.ts'
import { SettingsError, type SettingsStore } from './ai/settings.ts'
import { GitRequestError, readGitState, runGitAction } from './git-actions.ts'
import { MAX_SOURCE_BYTES, writeSource } from './source.ts'
import { applyFileOperation, checkPath, forgetWorkspace, workspaceFiles, WorkspaceError, type FileOperation } from './workspace.ts'

export interface ApiContext {
  repoRoot(): string
  graph(): RepoGraph | undefined
  /** After a file was saved. */
  onSaved?(path: string): void
  /** After a git command ran (successfully or not: a failed merge still changes the repository). */
  onGitChanged?(): Promise<void>
  /** After files were created, deleted or renamed (rebuild the graph unless a watcher does). */
  onFilesChanged?(): void
  /** The layer and role the build would give a path (undefined: excluded from the map). */
  classify?(path: string): { layer: string; role: string; reason: string } | undefined
  /** The AI assistant (absent: not offered). */
  ai?: { assistant: Assistant; settings: SettingsStore; conversations: ConversationStore; baseURL?: string }
  /** The Board's AI work: the config (ai file, models), a rebuild, and a way to tell the viewers. */
  board?: { config: RepoMapConfig; rebuild(): Promise<RepoGraph>; broadcast(event: string, data: unknown): void }
}

/** The one summaries run a server does at a time. */
interface BoardJob {
  running: boolean
  progress?: SummarizeProgress
  result?: { placed: number; written: number; failed: number; remaining: number }
  error?: string
  controller?: AbortController
}
const boardJobs = new WeakMap<object, BoardJob>()

/** On a writable server the code panel may open every file git lists, not only the graph's. */
export function workspaceAllows(repoRoot: string): (path: string) => boolean {
  return (path) => workspaceFiles(repoRoot).set.has(path)
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const MAX_ACTION_BYTES = 256 * 1024

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host) || /^127(\.\d{1,3}){3}$/.test(host)
}

/** Handles the request when it is one of the writing routes; false otherwise. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL, context: ApiContext): Promise<boolean> {
  const route = `${req.method} ${url.pathname}`
  if (route === 'GET /api/info') {
    sendJson(res, 200, { writable: true, ai: !!context.ai, boardAi: !!(context.ai && context.board) })
    return true
  }
  if (url.pathname === '/source' && req.method === 'PUT') {
    if (!allowed(req, res)) return true
    await saveFile(req, res, url, context)
    return true
  }
  if (route === 'GET /api/git/state') {
    if (!allowed(req, res, false)) return true
    try {
      sendJson(res, 200, await readGitState(context.repoRoot()))
    } catch (error) {
      sendJson(res, 409, { error: `Not a git repository: ${(error as Error).message}` })
    }
    return true
  }
  if (route === 'POST /api/git') {
    if (!allowed(req, res)) return true
    await gitAction(req, res, context)
    return true
  }
  if (route === 'GET /api/files') {
    if (!allowed(req, res, false)) return true
    sendJson(res, 200, { files: workspaceFiles(context.repoRoot()).files })
    return true
  }
  if (route === 'GET /api/files/classify') {
    if (!allowed(req, res, false)) return true
    if (!context.classify) {
      sendJson(res, 404, { error: 'Not available' })
      return true
    }
    try {
      const { rel } = checkPath(context.repoRoot(), url.searchParams.get('path'))
      const result = context.classify(rel)
      sendJson(res, 200, result ? { path: rel, ...result, excluded: false } : { path: rel, excluded: true })
    } catch (error) {
      sendJson(res, error instanceof WorkspaceError ? error.status : 500, { error: (error as Error).message })
    }
    return true
  }
  if (route === 'POST /api/files') {
    if (!allowed(req, res)) return true
    await fileOperation(req, res, context)
    return true
  }
  if (url.pathname.startsWith('/api/ai/')) {
    if (!allowed(req, res, req.method !== 'GET')) return true
    if (!context.ai) {
      sendJson(res, 404, { error: 'The assistant is not available on this server' })
      return true
    }
    await aiRoute(req, res, url, context.ai)
    return true
  }
  if (url.pathname.startsWith('/api/board/')) {
    if (!allowed(req, res, req.method !== 'GET')) return true
    await boardRoute(req, res, url, context)
    return true
  }
  if (url.pathname.startsWith('/api/')) {
    sendJson(res, ['/api/git', '/api/git/state', '/api/files'].includes(url.pathname) ? 405 : 404, { error: 'Not found' })
    return true
  }
  return false
}

/** Refuses requests that don't come from the viewer on this machine. */
function allowed(req: IncomingMessage, res: ServerResponse, writing = true): boolean {
  const host = hostnameOf(req.headers.host)
  if (!host || !isLoopbackHost(host)) {
    sendJson(res, 403, { error: 'Editing is only available on localhost' })
    return false
  }
  const origin = req.headers.origin
  if (origin !== undefined && origin !== `http://${req.headers.host}`) {
    sendJson(res, 403, { error: 'Cross-origin requests are not allowed' })
    return false
  }
  if (writing && req.headers[WRITE_HEADER.toLowerCase()] !== '1') {
    sendJson(res, 403, { error: `Missing ${WRITE_HEADER} header` })
    return false
  }
  return true
}

function hostnameOf(host: string | undefined): string | undefined {
  if (!host) return undefined
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1).toLowerCase()
  return host.split(':')[0].toLowerCase()
}

async function saveFile(req: IncomingMessage, res: ServerResponse, url: URL, context: ApiContext): Promise<void> {
  const body = await readBody(req, MAX_SOURCE_BYTES + 1)
  if (body === null) return sendText(res, 413, 'The file is larger than 2 MB')
  const path = url.searchParams.get('path')
  const result = writeSource(context.repoRoot(), context.graph(), path, body.toString('utf8'), req.headers['if-match'] ?? null, workspaceAllows(context.repoRoot()))
  if (!result.ok) {
    res.writeHead(result.status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...(result.etag ? { ETag: result.etag } : {}) })
    res.end(result.error)
    return
  }
  res.writeHead(204, { ETag: result.etag, 'Cache-Control': 'no-store' }).end()
  if (path) context.onSaved?.(path)
}

async function gitAction(req: IncomingMessage, res: ServerResponse, context: ApiContext): Promise<void> {
  if (!(req.headers['content-type'] ?? '').includes('application/json')) return sendJson(res, 415, { error: 'Send JSON' })
  const body = await readBody(req, MAX_ACTION_BYTES)
  if (body === null) return sendJson(res, 413, { error: 'Request too large' })
  let action: GitAction
  try {
    action = JSON.parse(body.toString('utf8')) as GitAction
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('missing "type"')
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid request: ${(error as Error).message}` })
  }
  try {
    const result = await runGitAction(context.repoRoot(), action)
    // Checkouts, pulls, discards and stashes change the files too.
    forgetWorkspace(context.repoRoot())
    // The history is re-read before answering, so the viewer can load it right away.
    await context.onGitChanged?.().catch(() => undefined)
    sendJson(res, 200, result)
  } catch (error) {
    if (error instanceof GitRequestError) return sendJson(res, 400, { ok: false, error: error.message })
    sendJson(res, 500, { ok: false, error: (error as Error).message })
  }
}

async function fileOperation(req: IncomingMessage, res: ServerResponse, context: ApiContext): Promise<void> {
  if (!(req.headers['content-type'] ?? '').includes('application/json')) return sendJson(res, 415, { error: 'Send JSON' })
  const body = await readBody(req, MAX_SOURCE_BYTES + 64 * 1024)
  if (body === null) return sendJson(res, 413, { ok: false, error: 'Request too large' })
  let operation: FileOperation
  try {
    operation = JSON.parse(body.toString('utf8')) as FileOperation
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid request: ${(error as Error).message}` })
  }
  const root = context.repoRoot()
  try {
    const result = applyFileOperation(root, operation)
    forgetWorkspace(root)
    context.onFilesChanged?.()
    sendJson(res, 200, { ok: true, ...result })
  } catch (error) {
    if (error instanceof WorkspaceError) return sendJson(res, error.status, { ok: false, error: error.message })
    sendJson(res, 500, { ok: false, error: (error as Error).message })
  }
}

/** The assistant's routes (the guard has run). */
async function aiRoute(req: IncomingMessage, res: ServerResponse, url: URL, ai: NonNullable<ApiContext['ai']>): Promise<void> {
  const { assistant, settings } = ai
  const path = url.pathname.slice('/api/ai/'.length)
  const conversationMatch = /^conversations\/([0-9a-f-]{36})$/.exec(path)
  try {
    if (req.method === 'GET' && path === 'settings') return sendJson(res, 200, settings.view())
    if (req.method === 'PUT' && path === 'settings') return sendJson(res, 200, settings.update(await jsonBody<AiSettingsUpdate>(req)))
    if (req.method === 'GET' && path === 'models') return sendJson(res, 200, { models: await assistant.models() })
    if (req.method === 'GET' && path === 'conversations') return sendJson(res, 200, { conversations: ai.conversations.list() })
    if (conversationMatch && req.method === 'GET') {
      const conversation = assistant.conversation(conversationMatch[1])
      if (!conversation) return sendJson(res, 404, { error: 'No such chat' })
      return sendJson(res, 200, { ...publicConversation(conversation), running: assistant.isRunning(conversation.id) })
    }
    if (conversationMatch && req.method === 'DELETE') {
      if (assistant.isRunning(conversationMatch[1])) return sendJson(res, 409, { error: 'The assistant is still working on this chat' })
      const deleted = ai.conversations.delete(conversationMatch[1])
      return sendJson(res, deleted ? 200 : 404, { ok: deleted })
    }
    if (req.method === 'POST' && path === 'approve') {
      const body = await jsonBody<{ conversationId: string; toolId: string; decision: ApprovalDecision }>(req)
      if (!['allow', 'deny', 'always'].includes(body.decision)) return sendJson(res, 400, { error: 'decision must be allow, deny or always' })
      return sendJson(res, 200, { ok: assistant.approve(body.conversationId, body.toolId, body.decision) })
    }
    if (req.method === 'POST' && path === 'stop') {
      const body = await jsonBody<{ conversationId: string }>(req)
      return sendJson(res, 200, { ok: assistant.stop(body.conversationId) })
    }
    if (req.method === 'POST' && path === 'chat') return await chat(req, res, assistant)
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof SettingsError || error instanceof SyntaxError) return sendJson(res, 400, { error: error.message })
    const failure = apiError(error)
    if (!res.headersSent) sendJson(res, failure.status, { error: failure.message })
  }
}

/** The Board's AI routes (the guard has run). */
async function boardRoute(req: IncomingMessage, res: ServerResponse, url: URL, context: ApiContext): Promise<void> {
  const { board, ai } = context
  if (!board || !ai) return sendJson(res, 404, { error: 'The AI is not available on this server' })
  let job = boardJobs.get(board)
  if (!job) boardJobs.set(board, (job = { running: false }))
  const status = () => ({ running: job.running, progress: job.progress, result: job.result, error: job.error })
  const path = url.pathname.slice('/api/board/'.length)
  const options = { settings: ai.settings, baseURL: ai.baseURL }
  try {
    if (req.method === 'GET' && path === 'ai') return sendJson(res, 200, status())
    if (req.method === 'POST' && path === 'summarize') {
      if (job.running) return sendJson(res, 409, { error: 'Summaries are already being written' })
      const body = await jsonBody<{ limit?: number; place?: boolean }>(req)
      if (!ai.settings.apiKey()) return sendJson(res, 400, { error: 'No API key: add one in the settings' })
      const controller = new AbortController()
      Object.assign(job, { running: true, progress: undefined, result: undefined, error: undefined, controller })
      board.broadcast('board-ai', status())
      void summarizeBoard(board.config, {
        ...options,
        signal: controller.signal,
        limit: typeof body.limit === 'number' && body.limit > 0 ? body.limit : undefined,
        place: body.place !== false,
        rebuild: board.rebuild,
        onProgress: (progress) => {
          job.progress = progress
          board.broadcast('board-ai', status())
        },
      })
        .then((result) => (job.result = result))
        .catch((error: Error) => (job.error = controller.signal.aborted ? 'Stopped' : error.message))
        .finally(() => {
          job.running = false
          job.controller = undefined
          board.broadcast('board-ai', status())
        })
      return sendJson(res, 202, status())
    }
    if (req.method === 'POST' && path === 'stop') {
      job.controller?.abort()
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && path === 'briefing') {
      const body = await jsonBody<{ base?: string; head?: string; touched?: string[]; impacted?: string[]; tests?: string[] }>(req)
      const graph = context.graph()
      if (!graph) return sendJson(res, 409, { error: 'The map is not built yet' })
      const diff = await readReviewDiff(context.repoRoot(), body.base ?? null, body.head ?? null)
      const input: BriefingInput = { diff, touched: strings(body.touched), impacted: strings(body.impacted), tests: strings(body.tests) }
      const controller = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) controller.abort()
      })
      return sendJson(res, 200, { markdown: await reviewBriefing(board.config, graph, input, { ...options, signal: controller.signal }) })
    }
    if (req.method === 'POST' && path === 'suggest-rules') {
      const graph = context.graph()
      if (!graph) return sendJson(res, 409, { error: 'The map is not built yet' })
      return sendJson(res, 200, { rules: await suggestRules(board.config, graph, options) })
    }
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof BoardAiError || error instanceof ReviewError || error instanceof SettingsError || error instanceof SyntaxError) return sendJson(res, 400, { error: error.message })
    const failure = apiError(error)
    if (!res.headersSent) sendJson(res, failure.status, { error: failure.message })
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 500) : []
}

/** One message: the reply streams back as JSON lines (ChatEvent), until "done". */
async function chat(req: IncomingMessage, res: ServerResponse, assistant: Assistant): Promise<void> {
  const request = await jsonBody<SendRequest>(req)
  const controller = new AbortController()
  // The browser went away (tab closed, reload): stop working for it.
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const emit = (event: ChatEvent) => {
    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`)
  }
  try {
    await assistant.send(request, emit, controller.signal)
  } catch (error) {
    const failure = error instanceof AssistantError ? error : apiError(error)
    if (!res.headersSent) return sendJson(res, failure.status, { error: failure.message })
    emit({ type: 'error', message: failure.message })
  }
  res.end()
}

async function jsonBody<T>(req: IncomingMessage): Promise<T> {
  if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new SettingsError('Send JSON')
  const body = await readBody(req, 1024 * 1024)
  if (body === null) throw new SettingsError('Request too large')
  return JSON.parse(body.toString('utf8') || '{}') as T
}

/** The request body, or null when it is larger than `limit` bytes. */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) tooLarge = true
      else chunks.push(chunk)
    })
    req.on('end', () => resolveBody(tooLarge ? null : Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(text)
}
