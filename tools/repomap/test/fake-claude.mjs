#!/usr/bin/env node
// A stand-in for the `claude` CLI in tests (REPOMAP_CLAUDE points here): records its arguments and
// stdin to $FAKE_CLAUDE_LOG, then answers like `claude -p` does.
import { appendFileSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const prompt = readFileSync(0, 'utf8')
if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ args, prompt, cwd: process.cwd() })}\n`)
const out = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
const format = args[args.indexOf('--output-format') + 1]

if (format === 'json') {
  if (prompt.includes('FAIL')) {
    out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Credit balance is too low' })
    process.exit(1)
  }
  // Board AI: a summary for every "### key" block, or one for the whole prompt.
  const keys = [...prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1])
  const result = keys.length ? JSON.stringify(Object.fromEntries(keys.map((k) => [k, `About ${k}`]))) : JSON.stringify({ summary: 'The whole thing.' })
  out({ type: 'result', subtype: 'success', is_error: false, result, session_id: 's-json' })
} else {
  // The chat: a few words, an edit, then the answer pointing at the board.
  const session = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : 'session-1'
  out({ type: 'system', subtype: 'init', session_id: session, model: 'claude-test' })
  const ev = (event) => out({ type: 'stream_event', event, session_id: session, parent_tool_use_id: null })
  ev({ type: 'message_start', message: { model: 'claude-test' } })
  ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Fixing it.' } })
  ev({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tool-1', name: 'Edit', input: {} } })
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Edit', input: { file_path: `${process.cwd()}/src/a.ts`, old_string: 'a', new_string: 'b' } }] }, parent_tool_use_id: null })
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'The file was updated.' }] }, parent_tool_use_id: null })
  ev({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tool-2', name: 'Bash', input: {} } })
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool-2', name: 'Bash', input: { command: 'git push' } }] }, parent_tool_use_id: null })
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-2', is_error: true, content: "Claude requested permissions to use Bash, but you haven't granted it yet." }] }, parent_tool_use_id: null })
  // A subagent's step: not shown on its own.
  out({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', id: 'sub-1', name: 'Read' } }, parent_tool_use_id: 'tool-9' })
  ev({ type: 'message_start', message: { model: 'claude-test' } })
  ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done.\nshow-on-board: ContactForm, `api`' } })
  out({ type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: 'Done.', session_id: session, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 } })
}
