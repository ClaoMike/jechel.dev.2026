/** The assistant's endpoints on `repomap serve` (see src/core/api.ts). */
import type { AiModel, AiSettingsUpdate, AiSettingsView, ApprovalDecision, ChatEvent, ContextItem, Conversation, ConversationSummary, Effort, PermissionMode } from '../../../src/shared/ai.ts'
import { WRITE_HEADER } from '../../../src/shared/git-actions.ts'
import { parseLines } from './transcript.ts'

export class AiRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`api/ai/${path}`, {
      method,
      cache: 'no-store',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AiRequestError(0, 'repomap could not be reached.')
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new AiRequestError(response.status, data.error ?? `HTTP ${response.status}`)
  return data
}

export const aiApi = {
  settings: () => call<AiSettingsView>('GET', 'settings'),
  saveSettings: (update: AiSettingsUpdate) => call<AiSettingsView>('PUT', 'settings', update),
  models: () => call<{ models: AiModel[] }>('GET', 'models').then((r) => r.models),
  conversations: () => call<{ conversations: ConversationSummary[] }>('GET', 'conversations').then((r) => r.conversations),
  conversation: (id: string) => call<Conversation & { running: boolean }>('GET', `conversations/${id}`),
  deleteConversation: (id: string) => call<{ ok: boolean }>('DELETE', `conversations/${id}`),
  approve: (conversationId: string, toolId: string, decision: ApprovalDecision) => call<{ ok: boolean }>('POST', 'approve', { conversationId, toolId, decision }),
  stop: (conversationId: string) => call<{ ok: boolean }>('POST', 'stop', { conversationId }),
}

export interface ChatRequest {
  conversationId?: string
  text: string
  context: ContextItem[]
  model?: string
  effort?: Effort
  mode?: PermissionMode
}

/** Sends a message; `onEvent` gets each event as it streams in. Resolves when the reply is complete. */
export async function sendChat(request: ChatRequest, onEvent: (event: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  let response: Response
  try {
    response = await fetch('api/ai/chat', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') return
    throw new AiRequestError(0, 'repomap could not be reached.')
  }
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new AiRequestError(response.status, data.error ?? `HTTP ${response.status}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseLines(buffer)
      buffer = parsed.rest
      parsed.events.forEach(onEvent)
    }
    parseLines(`${buffer}\n`).events.forEach(onEvent)
  } catch (error) {
    if ((error as Error).name !== 'AbortError') throw error
  }
}
