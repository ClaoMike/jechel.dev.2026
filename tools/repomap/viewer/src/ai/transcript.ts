/**
 * The chat transcript, updated by the events the server streams while the assistant works. Pure, so
 * it runs in tests too.
 */
import type { ChatEvent, ChatItem } from '../../../src/shared/ai.ts'

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
}

/** The transcript after one event (a new array when something changed). */
export function applyEvent(items: ChatItem[], event: ChatEvent): ChatItem[] {
  switch (event.type) {
    case 'start':
      return [...items, event.user]
    case 'text':
    case 'thinking':
    case 'model': {
      const at = items.findIndex((item) => item.id === event.itemId)
      const current: Extract<ChatItem, { type: 'assistant' }> = at >= 0 && items[at].type === 'assistant' ? (items[at] as Extract<ChatItem, { type: 'assistant' }>) : { type: 'assistant', id: event.itemId, text: '' }
      const next =
        event.type === 'text'
          ? { ...current, text: current.text + event.text }
          : event.type === 'thinking'
            ? { ...current, thinking: (current.thinking ?? '') + event.text }
            : { ...current, model: event.model }
      return at >= 0 ? items.map((item, i) => (i === at ? next : item)) : [...items, next]
    }
    case 'tool':
    case 'approval': {
      const at = items.findIndex((item) => item.type === 'tool' && item.id === event.step.id)
      const item: ChatItem = { type: 'tool', id: event.step.id, step: event.step }
      return at >= 0 ? items.map((existing, i) => (i === at ? item : existing)) : [...items, item]
    }
    case 'notice':
      return [...items, event.item]
    case 'error':
      return [...items, { type: 'notice', id: `error-${items.length}`, level: 'error', text: event.message }]
    default:
      return items
  }
}

export function addUsage(total: Usage, event: ChatEvent): Usage {
  if (event.type !== 'usage') return total
  return {
    inputTokens: total.inputTokens + event.inputTokens,
    outputTokens: total.outputTokens + event.outputTokens,
    cacheReadTokens: total.cacheReadTokens + event.cacheReadTokens,
  }
}

/** Splits a streamed response body into JSON lines; returns the events and what is left over. */
export function parseLines(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = []
  let rest = buffer
  let at
  while ((at = rest.indexOf('\n')) >= 0) {
    const line = rest.slice(0, at).trim()
    rest = rest.slice(at + 1)
    if (line) events.push(JSON.parse(line) as ChatEvent)
  }
  return { events, rest }
}
