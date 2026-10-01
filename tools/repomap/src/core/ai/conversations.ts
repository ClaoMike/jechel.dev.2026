/**
 * Chats with the assistant, saved as JSON beside the graph (in .out, which git ignores): the exact
 * message history sent to the model (only ever appended to - the model's thinking stays valid, the
 * prompt cache keeps hitting) and the transcript the chat shows.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import type { ChatItem, Conversation, ConversationSummary, ToolClass } from '../../shared/ai.ts'

export interface StoredConversation extends Conversation {
  createdAt: string
  /** The system prompt, frozen when the chat started (part of the cached prefix). */
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  /** Kinds of actions the user allowed for the rest of this chat. */
  allowed: ToolClass[]
}

export class ConversationStore {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  create(model: string, system: string): StoredConversation {
    const now = new Date().toISOString()
    return { id: randomUUID(), title: 'New chat', createdAt: now, updatedAt: now, model, system, messages: [], items: [], allowed: [] }
  }

  list(): ConversationSummary[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => this.read(name.slice(0, -5)))
      .filter((c): c is StoredConversation => !!c)
      .map(summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): StoredConversation | undefined {
    return this.read(id)
  }

  save(conversation: StoredConversation): void {
    mkdirSync(this.dir, { recursive: true })
    conversation.updatedAt = new Date().toISOString()
    writeFileSync(this.file(conversation.id), JSON.stringify(conversation))
  }

  delete(id: string): boolean {
    const file = this.file(id)
    if (!existsSync(file)) return false
    rmSync(file)
    return true
  }

  private read(id: string): StoredConversation | undefined {
    const file = this.file(id)
    if (!existsSync(file)) return undefined
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as StoredConversation
    } catch {
      return undefined
    }
  }

  private file(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid conversation id')
    return join(this.dir, `${id}.json`)
  }
}

export function summary(conversation: StoredConversation): ConversationSummary {
  return { id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt, model: conversation.model }
}

/** The transcript the chat shows (no model history). */
export function publicConversation(conversation: StoredConversation): Conversation {
  return { ...summary(conversation), items: conversation.items as ChatItem[] }
}
