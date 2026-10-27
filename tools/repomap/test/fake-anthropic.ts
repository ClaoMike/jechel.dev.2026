/**
 * A stand-in for the Anthropic API, for tests (no network, no cost): serves /v1/models and streams
 * scripted /v1/messages responses in the real Server-Sent Events format, recording every request.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'

export type FakeBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'fallback'; from: string; to: string }

export interface FakeResponse {
  content: FakeBlock[]
  stop_reason?: string
  stop_details?: { type: 'refusal'; category: string | null; explanation?: string | null }
  model?: string
  /** Wait this long before streaming (to test "stop"). */
  delayMs?: number
}

export interface RecordedRequest {
  path: string
  headers: IncomingMessage['headers']
  body: Record<string, unknown>
}

export const FAKE_MODELS = [
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], max_tokens: 128_000 },
  { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], max_tokens: 128_000 },
  { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', efforts: [], max_tokens: 64_000 },
]

export class FakeAnthropic {
  readonly requests: RecordedRequest[] = []
  private readonly script: (FakeResponse | ((request: RecordedRequest) => FakeResponse))[] = []
  private server: Server | undefined
  url = ''
  /** Answer every call with this status (e.g. 401 for a bad key). */
  failWith: { status: number; type: string; message: string } | null = null

  /** Queues the next responses of /v1/messages, in order. */
  reply(...responses: (FakeResponse | ((request: RecordedRequest) => FakeResponse))[]): this {
    this.script.push(...responses)
    return this
  }

  /** Drops the scripted responses not used yet. */
  clear(): this {
    this.script.length = 0
    return this
  }

  get messages(): RecordedRequest[] {
    return this.requests.filter((r) => r.path === '/v1/messages')
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        const path = (req.url ?? '').split('?')[0]
        const recorded: RecordedRequest = { path, headers: req.headers, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} }
        this.requests.push(recorded)
        if (this.failWith) {
          res.writeHead(this.failWith.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ type: 'error', error: { type: this.failWith.type, message: this.failWith.message } }))
          return
        }
        if (req.method === 'GET' && path === '/v1/models') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          const data = FAKE_MODELS.map(modelInfo)
          res.end(JSON.stringify({ data, has_more: false, first_id: data[0].id, last_id: data.at(-1)!.id }))
          return
        }
        const single = /^\/v1\/models\/(.+)$/.exec(path)
        if (req.method === 'GET' && single) {
          const model = FAKE_MODELS.find((m) => m.id === single[1])
          if (!model) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: `model: ${single[1]}` } }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(modelInfo(model)))
          return
        }
        if (req.method === 'POST' && path === '/v1/messages') {
          const next = this.script.shift()
          if (!next) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'The fake API has no scripted response left' } }))
            return
          }
          const response = typeof next === 'function' ? next(recorded) : next
          void stream(res, response, String(recorded.body.model))
          return
        }
        res.writeHead(404).end()
      })
    })
    await new Promise<void>((resolveListen) => this.server!.listen(0, '127.0.0.1', resolveListen))
    const address = this.server.address()
    this.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
    return this.url
  }

  async close(): Promise<void> {
    await new Promise<void>((resolveClose) => {
      this.server?.closeAllConnections?.()
      this.server?.close(() => resolveClose())
    })
  }
}

function modelInfo(model: (typeof FAKE_MODELS)[number]) {
  const effort = Object.fromEntries(['low', 'medium', 'high', 'xhigh', 'max'].map((level) => [level, { supported: model.efforts.includes(level) }]))
  return {
    type: 'model',
    id: model.id,
    display_name: model.display_name,
    created_at: '2026-01-01T00:00:00Z',
    max_input_tokens: model.id.includes('haiku') ? 200_000 : 1_000_000,
    max_tokens: model.max_tokens,
    allowed_fallback_models: [],
    capabilities: {
      effort: { supported: model.efforts.length > 0, ...effort },
      thinking: { supported: true, types: { adaptive: { supported: !model.id.includes('haiku') }, enabled: { supported: model.id.includes('haiku') } } },
    },
  }
}

async function stream(res: import('node:http').ServerResponse, response: FakeResponse, requestedModel: string): Promise<void> {
  if (response.delayMs) await new Promise((r) => setTimeout(r, response.delayMs))
  if (res.destroyed) return
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const model = response.model ?? requestedModel
  send('message_start', {
    type: 'message_start',
    message: { id: `msg_${Math.random().toString(36).slice(2)}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 } },
  })
  response.content.forEach((block, index) => {
    if (block.type === 'text') {
      send('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      for (const piece of block.text.match(/.{1,12}/gs) ?? []) send('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } })
    } else if (block.type === 'thinking') {
      send('content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } })
      send('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: block.thinking } })
      send('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig' } })
    } else if (block.type === 'tool_use') {
      send('content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } })
      const json = JSON.stringify(block.input)
      for (const piece of json.match(/.{1,20}/gs) ?? []) send('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: piece } })
    } else {
      send('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'fallback', from: { model: block.from }, to: { model: block.to }, trigger: { type: 'refusal', category: 'cyber' } },
      })
    }
    send('content_block_stop', { type: 'content_block_stop', index })
  })
  send('message_delta', { type: 'message_delta', delta: { stop_reason: response.stop_reason ?? 'end_turn', stop_sequence: null, stop_details: response.stop_details ?? null }, usage: { output_tokens: 50 } })
  send('message_stop', { type: 'message_stop' })
  res.end()
}
