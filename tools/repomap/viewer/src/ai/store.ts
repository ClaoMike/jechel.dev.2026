/**
 * The assistant's state in the viewer: the dock (open, height), settings and models, the chats, and
 * the message being worked on (streamed in, with approvals answered from the chat).
 */
import { create } from 'zustand'
import type { AiModel, AiSettingsUpdate, AiSettingsView, ApprovalDecision, ChatItem, ContextItem, ConversationSummary } from '../../../src/shared/ai.ts'
import { serverInfo } from '../model/server.ts'
import { readPref, writePref } from '../model/url.ts'
import { aiApi, AiRequestError, sendChat } from './api.ts'
import { addUsage, applyEvent, type Usage } from './transcript.ts'

/** Files the assistant changed: the code panel, the explorer and the git bar catch up. */
export const FILES_CHANGED_EVENT = 'repomap:files-changed'

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }

interface State {
  /** The server runs the assistant (null: not asked yet). */
  available: boolean | null
  open: boolean
  height: number
  settingsOpen: boolean
  settings: AiSettingsView | null
  models: AiModel[] | null
  modelsError: string | null
  conversations: ConversationSummary[]
  conversationId: string | null
  title: string | null
  items: ChatItem[]
  running: boolean
  usage: Usage
  /** Context kinds the user took off (stays off until put back). */
  excluded: string[]
  /** A focus request for the message box (bumped). */
  focusNonce: number
  error: string | null
}

interface Actions {
  init(): Promise<void>
  setOpen(open: boolean, focus?: boolean): void
  setHeight(height: number): void
  setSettingsOpen(open: boolean): void
  loadModels(): Promise<void>
  saveSettings(update: AiSettingsUpdate): Promise<boolean>
  newChat(): void
  openChat(id: string): Promise<void>
  deleteChat(id: string): Promise<void>
  send(text: string, context: ContextItem[]): Promise<void>
  stop(): Promise<void>
  approve(stepId: string, decision: ApprovalDecision): Promise<void>
  toggleContext(kind: string): void
}

let controller: AbortController | null = null

export const useAssistant = create<State & Actions>((set, get) => ({
  available: null,
  open: readPref<'open' | 'closed'>('assistantOpen', 'closed') === 'open',
  height: Number(readPref<string>('assistantHeight', '340')) || 340,
  settingsOpen: false,
  settings: null,
  models: null,
  modelsError: null,
  conversations: [],
  conversationId: null,
  title: null,
  items: [],
  running: false,
  usage: NO_USAGE,
  excluded: [],
  focusNonce: 0,
  error: null,

  async init() {
    if (!(await serverInfo()).ai) {
      set({ available: false })
      return
    }
    try {
      const [settings, conversations] = await Promise.all([aiApi.settings(), aiApi.conversations()])
      set({ available: true, settings, conversations })
      if (settings.hasKey) void get().loadModels()
    } catch {
      set({ available: false })
    }
  },

  setOpen(open, focus = open) {
    set({ open, ...(focus ? { focusNonce: get().focusNonce + 1 } : {}) })
    writePref('assistantOpen', open ? 'open' : 'closed')
  },

  setHeight(height) {
    const clamped = Math.round(Math.max(180, Math.min(height, window.innerHeight - 120)))
    set({ height: clamped })
    writePref('assistantHeight', String(clamped))
  },

  setSettingsOpen(open) {
    set({ settingsOpen: open })
  },

  async loadModels() {
    try {
      set({ models: await aiApi.models(), modelsError: null })
    } catch (error) {
      set({ models: null, modelsError: (error as Error).message })
    }
  },

  async saveSettings(update) {
    const before = get().settings
    // Model, effort and permissions switch at once (the server confirms); the key waits for the server.
    if (before && update.apiKey === undefined) {
      const { provider: _provider, apiKey: _apiKey, ...visible } = update
      set({ settings: { ...before, ...visible } })
    }
    try {
      const settings = await aiApi.saveSettings(update)
      set({ settings, error: null })
      if (update.apiKey !== undefined) {
        if (settings.hasKey) await get().loadModels()
        else set({ models: null })
      }
      return true
    } catch (error) {
      set({ error: (error as Error).message, ...(before ? { settings: before } : {}) })
      return false
    }
  },

  newChat() {
    if (get().running) return
    set({ conversationId: null, title: null, items: [], usage: NO_USAGE, error: null, focusNonce: get().focusNonce + 1 })
  },

  async openChat(id) {
    if (get().running) return
    try {
      const chat = await aiApi.conversation(id)
      set({ conversationId: chat.id, title: chat.title, items: chat.items, usage: NO_USAGE, error: null })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  async deleteChat(id) {
    await aiApi.deleteConversation(id).catch(() => undefined)
    if (get().conversationId === id) get().newChat()
    set({ conversations: await aiApi.conversations().catch(() => get().conversations) })
  },

  async send(text, context) {
    const message = text.trim()
    if (!message || get().running) return
    const settings = get().settings
    controller = new AbortController()
    set({ running: true, error: null })
    try {
      await sendChat(
        { conversationId: get().conversationId ?? undefined, text: message, context, model: settings?.model, effort: settings?.effort, mode: settings?.permissionMode },
        (event) => {
          if (event.type === 'start') set({ conversationId: event.conversation.id, title: event.conversation.title })
          if (event.type === 'files') window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: event.paths }))
          set({ items: applyEvent(get().items, event), usage: addUsage(get().usage, event) })
        },
        controller.signal,
      )
    } catch (error) {
      const failure = error as AiRequestError
      set({ error: failure.message })
      if (failure.status === 412 || failure.status === 401) set({ settingsOpen: true })
    } finally {
      controller = null
      set({ running: false })
      // The chat list (titles, order) and anything the assistant changed.
      void aiApi.conversations().then((conversations) => set({ conversations }), () => undefined)
      window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: [] }))
    }
  },

  async stop() {
    const id = get().conversationId
    if (id) await aiApi.stop(id).catch(() => undefined)
    else controller?.abort()
  },

  async approve(stepId, decision) {
    const id = get().conversationId
    if (!id) return
    // Shown at once; the server's confirmation follows on the stream.
    set({
      items: get().items.map((item) => (item.type === 'tool' && item.id === stepId ? { ...item, step: { ...item.step, status: decision === 'deny' ? 'denied' : 'running' } } : item)),
    })
    await aiApi.approve(id, stepId, decision).catch((error: Error) => set({ error: error.message }))
  },

  toggleContext(kind) {
    const excluded = get().excluded
    set({ excluded: excluded.includes(kind) ? excluded.filter((k) => k !== kind) : [...excluded, kind] })
  },
}))
