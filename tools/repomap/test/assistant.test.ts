/**
 * The AI assistant against a fake Anthropic API (no network, no cost): what it sends (model, thinking,
 * effort, caching, fallbacks, tools, context), the tool loop with approvals and permission modes,
 * what it refuses to touch, refusals, fallbacks, stopping, API errors, its shell, its settings, and
 * its HTTP routes behind the localhost guard.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import { Assistant, echoable, type SendRequest } from '../src/core/ai/assistant.ts'
import { ConversationStore } from '../src/core/ai/conversations.ts'
import { SettingsStore } from '../src/core/ai/settings.ts'
import { ShellSession } from '../src/core/ai/shell.ts'
import { startServer, type ServerHandle } from '../src/core/serve.ts'
import type { ApprovalDecision, ChatEvent, ToolStep } from '../src/shared/ai.ts'
import { WRITE_HEADER } from '../src/shared/git-actions.ts'
import type { RepoGraph } from '../src/shared/types.ts'
import { FakeAnthropic, type FakeResponse } from './fake-anthropic.ts'

const sandbox = mkdtempSync(join(tmpdir(), 'repomap-ai-'))
writeFileSync(join(sandbox, 'gitconfig'), '[user]\n\tname = Test\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n')
process.env.GIT_CONFIG_GLOBAL = join(sandbox, 'gitconfig')
process.env.GIT_CONFIG_NOSYSTEM = '1'
writeFileSync(join(sandbox, 'outside.txt'), 'not yours\n')

const fake = new FakeAnthropic()
let n = 0
const assistants: Assistant[] = []

const graph = (root: string): RepoGraph =>
  ({
    version: 1,
    meta: {
      repo: { name: 'shop', root },
      layers: [{ id: 'frontend', label: 'Frontend', color: '#38bdf8' }, { id: 'backend', label: 'Backend', color: '#4ade80' }],
      roles: [],
      kinds: [],
      edgeTypes: [],
    },
    nodes: [
      { id: 'frontend:symbol:src/Cart.tsx#Cart', label: 'Cart', kind: 'component', layer: 'frontend', role: 'production', file: 'src/Cart.tsx', line: 1 },
      { id: 'backend:route:GET /api/cart', label: 'GET /api/cart', kind: 'endpoint', layer: 'backend', role: 'production', file: 'api/Cart.cs', line: 3 },
    ],
    edges: [{ from: 'frontend:symbol:src/Cart.tsx#Cart', to: 'backend:route:GET /api/cart', type: 'calls', source: 'static', confidence: 1 }],
    unresolved: [],
  }) as unknown as RepoGraph

interface Setup {
  root: string
  assistant: Assistant
  settings: SettingsStore
  conversations: ConversationStore
  changed: string[][]
}

function setup(): Setup {
  const dir = join(sandbox, `case-${n++}`)
  const root = join(dir, 'repo')
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/Cart.tsx'), 'export function Cart() {\n  return <div>cart</div>\n}\n')
  writeFileSync(join(root, '.gitignore'), '.env\n')
  writeFileSync(join(root, '.env'), 'SECRET=hunter2\n')
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: root })
  const settings = new SettingsStore(join(dir, 'settings.json'), {})
  settings.update({ apiKey: 'sk-ant-test-0000000000abcd' })
  const conversations = new ConversationStore(join(dir, 'chats'))
  const changed: string[][] = []
  const assistant = new Assistant({
    root: () => root,
    graph: () => graph(root),
    settings,
    conversations,
    baseURL: fake.url,
    filesChanged: (paths) => changed.push(paths),
    gitChanged: async () => undefined,
  })
  assistants.push(assistant)
  return { root, assistant, settings, conversations, changed }
}

/** Sends a message; approvals are answered by `decide`. Resolves with every event. */
async function send(s: Setup, request: SendRequest, decide: (step: ToolStep) => ApprovalDecision = () => 'allow'): Promise<ChatEvent[]> {
  const events: ChatEvent[] = []
  let id = request.conversationId
  await s.assistant.send(request, (event) => {
    events.push(event)
    if (event.type === 'start') id = event.conversation.id
    if (event.type === 'approval') setImmediate(() => s.assistant.approve(id!, event.step.id, decide(event.step)))
  })
  return events
}

const tool = (id: string, name: string, input: unknown): FakeResponse => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' })
const say = (text: string): FakeResponse => ({ content: [{ type: 'text', text }] })
const lastBody = () => fake.messages.at(-1)!.body
type Block = { type: string; tool_use_id?: string; content?: string; is_error?: boolean; text?: string }
/** The tool results the assistant sent back in the last request. */
const lastResults = () => ((lastBody().messages as { role: string; content: Block[] }[]).at(-1)!.content).filter((b) => b.type === 'tool_result')

before(async () => {
  await fake.start()
})
after(async () => {
  for (const assistant of assistants) assistant.closeAll()
  await fake.close()
})
beforeEach(() => {
  fake.failWith = null
})

describe('the request', () => {
  it('asks Claude with thinking, effort, caching, fallbacks, the tools and what the user is looking at', async () => {
    const s = setup()
    fake.reply({ content: [{ type: 'thinking', thinking: 'Looking at the cart.' }, { type: 'text', text: 'The **Cart** calls `GET /api/cart`.' }] })
    const events = await send(s, { text: 'What does this call?', context: [{ kind: 'node', label: 'Cart', text: 'Cart (component) in src/Cart.tsx:1' }] })
    const body = lastBody()
    const request = fake.messages.at(-1)!
    assert.equal(body.model, 'claude-opus-5-5', 'the default model')
    assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' })
    assert.deepEqual(body.output_config, { effort: 'high' })
    assert.deepEqual(body.cache_control, { type: 'ephemeral' }, 'the conversation tail is cached')
    assert.deepEqual((body.system as { cache_control: unknown }[])[0].cache_control, { type: 'ephemeral' }, 'and the system prompt')
    assert.equal(body.fallbacks, 'default')
    assert.match(String(request.headers['anthropic-beta']), /server-side-fallback-2026-07-01/)
    assert.equal(request.headers['x-api-key'], 'sk-ant-test-0000000000abcd')
    assert.equal(body.max_tokens, 64000)
    const tools = body.tools as { name: string; type?: string; eager_input_streaming?: boolean }[]
    assert.deepEqual(tools.slice(0, 2).map((t) => t.type), ['text_editor_20250728', 'bash_20250124'])
    assert.ok(tools.filter((t) => !t.type).every((t) => t.eager_input_streaming === true), 'custom tools stream their input')
    assert.ok(tools.some((t) => t.name === 'web_search'))
    const first = (body.messages as { content: Block[] }[])[0].content[0].text!
    assert.match(first, /^<context>\n<node label="Cart">\nCart \(component\) in src\/Cart\.tsx:1\n<\/node>\n<\/context>\n\nWhat does this call\?$/)
    assert.match(String((body.system as { text: string }[])[0].text), /repository "shop"/)

    const text = events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')
    assert.equal(text, 'The **Cart** calls `GET /api/cart`.')
    assert.ok(events.some((e) => e.type === 'thinking'))
    assert.ok(events.some((e) => e.type === 'usage' && e.cacheReadTokens === 40))
    assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'end_turn' })
    const [summary] = s.conversations.list()
    assert.equal(summary.title, 'What does this call?')
    const saved = s.conversations.get(summary.id)!
    assert.deepEqual(saved.items.map((i) => i.type), ['user', 'assistant'])
  })

  it('leaves out what an older model does not take', async () => {
    const s = setup()
    fake.reply(say('Hi.'))
    await send(s, { text: 'Hello', model: 'claude-haiku-4-5' })
    const body = lastBody()
    assert.equal(body.thinking, undefined)
    assert.equal(body.output_config, undefined)
    assert.equal(body.fallbacks, undefined)
    assert.equal(body.max_tokens, 64000)
    assert.ok(!(body.tools as { name: string }[]).some((t) => t.name === 'web_search'))
  })

  it('continues a chat by appending to its history, never rewriting it', async () => {
    const s = setup()
    fake.reply({ content: [{ type: 'thinking', thinking: 'hm' }, { type: 'text', text: 'One.' }] }, say('Two.'))
    const events = await send(s, { text: 'first' })
    const id = (events[0] as { conversation: { id: string } }).conversation.id
    await send(s, { conversationId: id, text: 'second' })
    const [firstRequest, secondRequest] = fake.messages.slice(-2).map((r) => r.body.messages as unknown[])
    assert.deepEqual(secondRequest.slice(0, firstRequest.length), firstRequest, 'the earlier turns are sent back exactly')
    assert.equal(secondRequest.length, 3)
    const assistantTurn = secondRequest[1] as { content: { type: string }[] }
    assert.deepEqual(assistantTurn.content.map((b) => b.type), ['thinking', 'text'], 'thinking blocks are kept')
  })
})

describe('the tool loop', () => {
  it('asks before an edit, shows the diff, applies it and reports back', async () => {
    const s = setup()
    fake.reply(tool('t1', 'str_replace_based_edit_tool', { command: 'str_replace', path: 'src/Cart.tsx', old_str: '<div>cart</div>', new_str: '<section>cart</section>' }), say('Changed it.'))
    const approvals: ToolStep[] = []
    const events = await send(s, { text: 'Use a section' }, (step) => {
      approvals.push(step)
      return 'allow'
    })
    assert.equal(approvals.length, 1)
    assert.equal(approvals[0].title, 'Edit src/Cart.tsx')
    assert.match(approvals[0].diff!, /^-  return <div>cart<\/div>\n\+  return <section>cart<\/section>$/m)
    assert.equal(readFileSync(join(s.root, 'src/Cart.tsx'), 'utf8'), 'export function Cart() {\n  return <section>cart</section>\n}\n')
    assert.deepEqual(lastResults(), [{ type: 'tool_result', tool_use_id: 't1', content: 'Edited src/Cart.tsx' }])
    assert.deepEqual(s.changed, [['src/Cart.tsx']])
    assert.ok(events.some((e) => e.type === 'files' && e.paths[0] === 'src/Cart.tsx'))
    const done = events.filter((e) => e.type === 'tool').at(-1) as { step: ToolStep }
    assert.equal(done.step.status, 'done')
  })

  it('reports a declined edit back to Claude and changes nothing', async () => {
    const s = setup()
    fake.reply(tool('t1', 'str_replace_based_edit_tool', { command: 'create', path: 'src/New.tsx', file_text: 'x' }), say('OK, I will not.'))
    await send(s, { text: 'make a file' }, () => 'deny')
    const [result] = lastResults()
    assert.equal(result.is_error, true)
    assert.match(result.content!, /declined/)
    assert.throws(() => statSync(join(s.root, 'src/New.tsx')))
  })

  it('"always" allows that kind of action for the rest of the chat', async () => {
    const s = setup()
    fake.reply(
      tool('t1', 'str_replace_based_edit_tool', { command: 'create', path: 'src/A.ts', file_text: 'a\n' }),
      tool('t2', 'str_replace_based_edit_tool', { command: 'create', path: 'src/B.ts', file_text: 'b\n' }),
      say('Both made.'),
    )
    let asked = 0
    await send(s, { text: 'two files' }, () => {
      asked++
      return 'always'
    })
    assert.equal(asked, 1)
    assert.equal(readFileSync(join(s.root, 'src/B.ts'), 'utf8'), 'b\n')
  })

  it('follows the permission mode: reads always run, edits in "edits", commands only in "auto"', async () => {
    const s = setup()
    const asked: string[] = []
    const decide = (step: ToolStep): ApprovalDecision => {
      asked.push(step.class)
      return 'allow'
    }
    fake.reply(
      tool('r1', 'search_code', { pattern: 'Cart' }),
      tool('e1', 'str_replace_based_edit_tool', { command: 'create', path: 'notes.md', file_text: '# notes\n' }),
      tool('s1', 'bash', { command: 'ls src' }),
      say('done'),
    )
    await send(s, { text: 'go', mode: 'edits' }, decide)
    assert.deepEqual(asked, ['shell'])
    fake.reply(tool('s2', 'bash', { command: 'echo hi' }), say('done'))
    await send(s, { text: 'go', mode: 'auto' }, decide)
    assert.deepEqual(asked, ['shell'], 'auto asks nothing')
    assert.equal(lastResults()[0].content, 'hi')
  })

  it('reads, searches, finds, queries the map and git without asking', async () => {
    const s = setup()
    fake.reply(
      {
        content: [
          { type: 'tool_use', id: 'a', name: 'str_replace_based_edit_tool', input: { command: 'view', path: 'src/Cart.tsx' } },
          { type: 'tool_use', id: 'b', name: 'search_code', input: { pattern: 'function \\w+' } },
          { type: 'tool_use', id: 'c', name: 'find_files', input: { glob: 'src/**' } },
          { type: 'tool_use', id: 'd', name: 'map_query', input: { node: 'Cart' } },
          { type: 'tool_use', id: 'e', name: 'git_info', input: { what: 'log' } },
          { type: 'tool_use', id: 'f', name: 'str_replace_based_edit_tool', input: { command: 'view', path: 'src' } },
        ],
        stop_reason: 'tool_use',
      },
      say('Read it all.'),
    )
    let asked = 0
    await send(s, { text: 'look around' }, () => {
      asked++
      return 'allow'
    })
    assert.equal(asked, 0)
    const results = lastResults()
    assert.deepEqual(results.map((r) => r.tool_use_id), ['a', 'b', 'c', 'd', 'e', 'f'], 'all results in one message, in order')
    assert.match(results[0].content!, /^ {5}1\texport function Cart\(\) \{$/m)
    assert.match(results[1].content!, /src\/Cart\.tsx:1:export function Cart/)
    assert.match(results[2].content!, /^src\/Cart\.tsx$/)
    assert.match(results[3].content!, /-calls-> GET \/api\/cart \[endpoint, backend\]/)
    assert.match(results[4].content!, /init/)
    assert.match(results[5].content!, /Cart\.tsx/)
    assert.ok(results.every((r) => !r.is_error))
  })

  it('never reads or writes outside the repository, in .git, or files git ignores', async () => {
    const s = setup()
    fake.reply(
      {
        content: [
          { type: 'tool_use', id: 'a', name: 'str_replace_based_edit_tool', input: { command: 'view', path: '../outside.txt' } },
          { type: 'tool_use', id: 'b', name: 'str_replace_based_edit_tool', input: { command: 'view', path: '/etc/passwd' } },
          { type: 'tool_use', id: 'c', name: 'str_replace_based_edit_tool', input: { command: 'view', path: '.env' } },
          { type: 'tool_use', id: 'd', name: 'str_replace_based_edit_tool', input: { command: 'create', path: '.git/hooks/pre-commit', file_text: 'evil' } },
          { type: 'tool_use', id: 'e', name: 'str_replace_based_edit_tool', input: { command: 'create', path: '.env', file_text: 'SECRET=stolen' } },
          { type: 'tool_use', id: 'f', name: 'manage_files', input: { operation: 'delete', path: '../outside.txt' } },
        ],
        stop_reason: 'tool_use',
      },
      say('ok'),
    )
    await send(s, { text: 'try', mode: 'auto' })
    const results = lastResults()
    assert.ok(results.every((r) => r.is_error), JSON.stringify(results))
    assert.ok(results.every((r) => !r.content!.includes('hunter2') && !r.content!.includes('not yours')), 'nothing leaked')
    assert.match(results[2].content!, /ignored by git/)
    assert.equal(readFileSync(join(s.root, '.env'), 'utf8'), 'SECRET=hunter2\n')
    assert.equal(readFileSync(join(sandbox, 'outside.txt'), 'utf8'), 'not yours\n')
  })

  it('answers bad tool input with an error Claude can fix, and a str_replace that matches nothing or twice', async () => {
    const s = setup()
    fake.reply(
      {
        content: [
          { type: 'tool_use', id: 'a', name: 'str_replace_based_edit_tool', input: { command: 'str_replace', path: 'src/Cart.tsx', old_str: 'nope', new_str: 'x' } },
          { type: 'tool_use', id: 'b', name: 'str_replace_based_edit_tool', input: { command: 'str_replace', path: 'src/Cart.tsx', old_str: 'div', new_str: 'x' } },
          { type: 'tool_use', id: 'c', name: 'search_code', input: {} },
          { type: 'tool_use', id: 'd', name: 'no_such_tool', input: {} },
        ],
        stop_reason: 'tool_use',
      },
      say('ok'),
    )
    await send(s, { text: 'go', mode: 'auto' })
    const [a, b, c, d] = lastResults()
    assert.match(a.content!, /No match for old_str/)
    assert.match(b.content!, /matches 2 places/)
    assert.match(c.content!, /"pattern" is required/)
    assert.match(d.content!, /Unknown tool/)
    assert.ok([a, b, c, d].every((r) => r.is_error))
  })

  it('runs git commands like the History tab', async () => {
    const s = setup()
    writeFileSync(join(s.root, 'src/Cart.tsx'), 'changed\n')
    fake.reply(tool('g', 'git_command', { type: 'commit', summary: 'Change the cart', files: ['src/Cart.tsx'] }), say('Committed.'))
    await send(s, { text: 'commit it' })
    assert.match(lastResults()[0].content!, /^Committed 1 file to main\n\n\[main [0-9a-f]+\] Change the cart/)
    assert.equal(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: s.root, encoding: 'utf8' }).trim(), 'Change the cart')
  })
})

describe('when things go wrong', () => {
  it('stops on a refusal, answering the unfinished tool call so the chat can go on', async () => {
    const s = setup()
    fake.reply({ content: [{ type: 'tool_use', id: 'x', name: 'bash', input: { command: 'rm -rf /' } }], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' } })
    const events = await send(s, { text: 'do it', mode: 'auto' })
    assert.ok(events.some((e) => e.type === 'notice' && /declined.*cyber/.test(e.item.text)))
    const saved = s.conversations.get(s.conversations.list()[0].id)!
    const last = saved.messages.at(-1)!
    assert.equal(last.role, 'user')
    assert.equal((last.content as Block[])[0].tool_use_id, 'x', 'the tool call has its answer')
  })

  it('after a fallback, keeps only what the history may hold and runs nothing the declined model asked for', async () => {
    const s = setup()
    fake.reply({
      content: [
        { type: 'thinking', thinking: 'declined model thinking' },
        { type: 'tool_use', id: 'old', name: 'bash', input: { command: 'echo no' } },
        { type: 'fallback', from: 'claude-opus-5-5', to: 'claude-opus-4-8' },
        { type: 'text', text: 'Here is a safer answer.' },
      ],
      model: 'claude-opus-4-8',
    })
    const events = await send(s, { text: 'hm', mode: 'auto' })
    assert.ok(events.some((e) => e.type === 'notice' && /claude-opus-5-5 declined; claude-opus-4-8 continued/.test(e.item.text)))
    const saved = s.conversations.get(s.conversations.list()[0].id)!
    const assistantTurn = saved.messages[1].content as Block[]
    assert.deepEqual(assistantTurn.map((b) => b.type), ['fallback', 'text'])
  })

  it('stops while waiting for an approval, and the chat still continues', async () => {
    const s = setup()
    fake.reply(tool('t', 'bash', { command: 'echo later' }), say('Resumed fine.'))
    let id = ''
    const events: ChatEvent[] = []
    await s.assistant.send({ text: 'run it' }, (event) => {
      events.push(event)
      if (event.type === 'start') id = event.conversation.id
      if (event.type === 'approval') setImmediate(() => s.assistant.stop(id))
    })
    assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'stopped' })
    const saved = s.conversations.get(id)!
    assert.equal((saved.messages.at(-1)!.content as Block[])[0].content, 'Not run: the user stopped the assistant.')
    await send(s, { conversationId: id, text: 'go on' })
    const roles = (lastBody().messages as { role: string }[]).map((m) => m.role)
    assert.deepEqual(roles, ['user', 'assistant', 'user', 'user'], 'a valid history (the API joins the two user turns)')
  })

  it('stops a response mid-stream and keeps nothing half-written', async () => {
    const s = setup()
    fake.reply({ ...say('This takes a while'), delayMs: 300 })
    const controller = new AbortController()
    const events: ChatEvent[] = []
    setTimeout(() => controller.abort(), 50)
    await s.assistant.send({ text: 'slow' }, (e) => events.push(e), controller.signal)
    assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'stopped' })
    const saved = s.conversations.get(s.conversations.list()[0].id)!
    assert.deepEqual(saved.messages.map((m) => m.role), ['user'])
  })

  it('refuses a tool call cut off at the length limit', async () => {
    const s = setup()
    fake.reply({ content: [{ type: 'tool_use', id: 't', name: 'str_replace_based_edit_tool', input: { command: 'create', path: 'big.ts', file_text: 'partial' } }], stop_reason: 'max_tokens' })
    const events = await send(s, { text: 'write a big file', mode: 'auto' })
    assert.ok(events.some((e) => e.type === 'notice' && /cut off/.test(e.item.text)))
    assert.throws(() => statSync(join(s.root, 'big.ts')))
  })

  it('says what is wrong with the key, and needs one', async () => {
    const s = setup()
    fake.failWith = { status: 401, type: 'authentication_error', message: 'invalid x-api-key' }
    const events = await send(s, { text: 'hi' })
    assert.ok(events.some((e) => e.type === 'notice' && e.item.level === 'error' && /API key was not accepted/.test(e.item.text)))
    s.settings.update({ apiKey: '' })
    await assert.rejects(send(s, { text: 'hi' }), /Add an Anthropic API key/)
  })

  it('refuses a second message while the first is running', async () => {
    const s = setup()
    fake.reply(tool('t', 'bash', { command: 'echo 1' }), say('done'))
    let id = ''
    let second: Promise<unknown> | undefined
    await s.assistant.send({ text: 'first' }, (event) => {
      if (event.type === 'start') id = event.conversation.id
      if (event.type === 'approval') {
        second = s.assistant.send({ conversationId: id, text: 'second' }, () => undefined).then(
          () => 'sent',
          (error: Error) => error.message,
        )
        setImmediate(() => s.assistant.approve(id, event.step.id, 'allow'))
      }
    })
    assert.match(String(await second), /still working/)
  })
})

describe('echoing responses', () => {
  it('leaves the history alone without a fallback', () => {
    const content = [{ type: 'thinking' }, { type: 'text' }, { type: 'tool_use', id: 'x' }] as never[]
    assert.equal(echoable(content), content)
  })
})

describe('the shell', () => {
  it('keeps its directory and variables between commands, and merges stderr', async () => {
    const dir = mkdtempSync(join(sandbox, 'shell-'))
    mkdirSync(join(dir, 'sub'))
    const shell = new ShellSession(dir)
    try {
      await shell.run('cd sub && export GREETING=hello')
      const result = await shell.run('pwd; echo $GREETING; echo oops >&2; false')
      assert.match(result.output, /sub\nhello\noops$/)
      assert.equal(result.exitCode, 1)
      assert.equal((await shell.run('cat')).output, '', 'never waits for input')
    } finally {
      shell.close()
    }
  })

  it('stops a command that runs too long, and starts afresh', async () => {
    const shell = new ShellSession(sandbox)
    try {
      const slow = await shell.run('echo started; sleep 5', 200)
      assert.equal(slow.timedOut, true)
      assert.match(slow.output, /started/)
      assert.equal((await shell.run('echo again')).output, 'again')
    } finally {
      shell.close()
    }
  })

  it('caps long output, keeping its end', async () => {
    const shell = new ShellSession(sandbox)
    try {
      const result = await shell.run('seq 1 100000')
      assert.ok(result.output.length < 32_000)
      assert.match(result.output, /characters left out/)
      assert.match(result.output, /100000$/)
    } finally {
      shell.close()
    }
  })
})

describe('settings', () => {
  it('stores the key for the owner only, and never shows it', () => {
    const dir = mkdtempSync(join(sandbox, 'settings-'))
    const store = new SettingsStore(join(dir, 'nested', 'settings.json'), {})
    assert.equal(store.view().hasKey, false)
    const view = store.update({ apiKey: '  sk-ant-api03-secretsecretsecret-WXYZ  ', model: 'claude-sonnet-5-5', effort: 'xhigh', permissionMode: 'edits' })
    assert.deepEqual(
      { hasKey: view.hasKey, keyHint: view.keyHint, keySource: view.keySource, model: view.model, effort: view.effort, mode: view.permissionMode },
      { hasKey: true, keyHint: 'sk-ant-…WXYZ', keySource: 'settings', model: 'claude-sonnet-5-5', effort: 'xhigh', mode: 'edits' },
    )
    assert.ok(!JSON.stringify(view).includes('secretsecret'))
    assert.equal(statSync(join(dir, 'nested', 'settings.json')).mode & 0o777, 0o600)
    assert.equal(store.apiKey(), 'sk-ant-api03-secretsecretsecret-WXYZ')
    store.update({ apiKey: '' })
    assert.equal(store.view().hasKey, false)
  })

  it("falls back to the server's ANTHROPIC_API_KEY", () => {
    const store = new SettingsStore(join(mkdtempSync(join(sandbox, 'env-')), 's.json'), { ANTHROPIC_API_KEY: 'sk-ant-from-env-123456' })
    assert.deepEqual([store.view().keySource, store.view().keyHint], ['environment', 'sk-ant-…3456'])
  })

  it('rejects what makes no sense', () => {
    const store = new SettingsStore(join(mkdtempSync(join(sandbox, 'bad-')), 's.json'), {})
    assert.throws(() => store.update({ provider: 'openai' }), /not supported yet/)
    assert.throws(() => store.update({ effort: 'huge' as 'max' }), /Invalid effort/)
    assert.throws(() => store.update({ model: 'claude opus; rm -rf' }), /Invalid model/)
    assert.throws(() => store.update({ apiKey: 'two words' }), /no spaces/)
    assert.throws(() => store.update({ permissionMode: 'yolo' as 'auto' }), /Invalid permission/)
  })
})

function http(base: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  return new Promise((resolveReply, reject) => {
    const req = httpRequest(new URL(path, base), { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' } : {}), ...headers } }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (text += chunk))
      res.on('end', () => resolveReply({ status: res.statusCode ?? 0, text }))
    })
    req.on('error', reject)
    req.end(body !== undefined ? JSON.stringify(body) : undefined)
  })
}

describe('the assistant over HTTP', () => {
  let server: ServerHandle
  let readOnly: ServerHandle
  let root: string

  before(async () => {
    const dir = join(sandbox, 'http')
    root = join(dir, 'repo')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src/Cart.tsx'), 'x\n')
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph(root)))
    const common = { graphPath: join(dir, 'graph.json'), repoRoot: root, port: 0, host: '127.0.0.1', distDir: dir }
    server = await startServer({ ...common, writable: true, ai: { settingsPath: join(dir, 'settings.json'), conversationsDir: join(dir, 'chats'), baseURL: fake.url } })
    readOnly = await startServer({ ...common, ai: { settingsPath: join(dir, 'settings.json'), conversationsDir: join(dir, 'chats'), baseURL: fake.url } })
  })

  after(async () => {
    await server.close()
    await readOnly.close()
  })

  it('saves settings and lists models; the key never comes back', async () => {
    assert.equal(JSON.parse((await http(server.url, 'GET', '/api/ai/settings')).text).hasKey, false)
    const chat = await http(server.url, 'POST', '/api/ai/chat', { text: 'hi' })
    assert.equal(chat.status, 412, 'no key yet')
    const saved = await http(server.url, 'PUT', '/api/ai/settings', { apiKey: 'sk-ant-api03-verysecret-9876' })
    assert.equal(saved.status, 200)
    assert.ok(!saved.text.includes('verysecret'))
    assert.equal(JSON.parse(saved.text).keyHint, 'sk-ant-…9876')
    const models = JSON.parse((await http(server.url, 'GET', '/api/ai/models')).text).models as { id: string; efforts: string[] }[]
    assert.deepEqual(models.map((m) => m.id), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'])
    assert.deepEqual(models[0].efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
    assert.equal((await http(server.url, 'PUT', '/api/ai/settings', { effort: 'nope' })).status, 400)
  })

  it('streams a reply as JSON lines, with approvals answered over HTTP', async () => {
    fake.reply(tool('t1', 'str_replace_based_edit_tool', { command: 'create', path: 'src/New.tsx', file_text: 'export {}\n' }), say('Made it.'))
    const events: ChatEvent[] = []
    await new Promise<void>((resolveStream, reject) => {
      const req = httpRequest(new URL('/api/ai/chat', server.url), { method: 'POST', headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' } }, (res) => {
        assert.match(res.headers['content-type'] ?? '', /ndjson/)
        let buffer = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          buffer += chunk
          let at
          while ((at = buffer.indexOf('\n')) >= 0) {
            const event = JSON.parse(buffer.slice(0, at)) as ChatEvent
            buffer = buffer.slice(at + 1)
            events.push(event)
            if (event.type === 'approval') {
              const id = (events[0] as { conversation: { id: string } }).conversation.id
              void http(server.url, 'POST', '/api/ai/approve', { conversationId: id, toolId: event.step.id, decision: 'allow' })
            }
          }
        })
        res.on('end', resolveStream)
      })
      req.on('error', reject)
      req.end(JSON.stringify({ text: 'make a file' }))
    })
    assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'end_turn' })
    assert.equal(readFileSync(join(root, 'src/New.tsx'), 'utf8'), 'export {}\n')
    const list = JSON.parse((await http(server.url, 'GET', '/api/ai/conversations')).text).conversations as { id: string; title: string }[]
    assert.equal(list[0].title, 'make a file')
    const chat = JSON.parse((await http(server.url, 'GET', `/api/ai/conversations/${list[0].id}`)).text) as { items: { type: string }[]; running: boolean }
    assert.deepEqual(chat.items.map((i) => i.type), ['user', 'tool', 'assistant'])
    assert.equal(chat.running, false)
    // No body: Node's client doesn't frame a DELETE body, which would garble the next request on the connection.
    assert.equal((await http(server.url, 'DELETE', `/api/ai/conversations/${list[0].id}`, undefined, { [WRITE_HEADER]: '1' })).status, 200)
    assert.equal((await http(server.url, 'GET', `/api/ai/conversations/${list[0].id}`)).status, 404)
  })

  it('answers only the viewer on this machine, and not at all when read-only', async () => {
    assert.equal((await http(server.url, 'PUT', '/api/ai/settings', { apiKey: 'x' }, { [WRITE_HEADER]: '' })).status, 403, 'no header')
    assert.equal((await http(server.url, 'POST', '/api/ai/chat', { text: 'hi' }, { Origin: 'https://evil.example' })).status, 403)
    assert.equal((await http(server.url, 'GET', '/api/ai/settings', undefined, { Host: 'evil.example' })).status, 403, 'DNS rebinding')
    assert.equal((await http(readOnly.url, 'GET', '/api/ai/settings')).status, 404)
    assert.equal((await http(readOnly.url, 'POST', '/api/ai/chat', { text: 'hi' })).status, 405)
  })
})
