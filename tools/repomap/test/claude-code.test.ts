/**
 * The Claude Code provider (the `claude` CLI on your subscription instead of an API key), against a
 * stand-in script: the Board's AI one-shot prompts and the chat assistant's streamed turns.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { suggestRules } from '../src/core/ai/board-ai.ts'
import { Assistant } from '../src/core/ai/assistant.ts'
import { askClaudeCode, claudeBinary, ClaudeCodeError } from '../src/core/ai/claude-code.ts'
import { permissionArgs } from '../src/core/ai/claude-code-chat.ts'
import { ConversationStore } from '../src/core/ai/conversations.ts'
import { SettingsStore } from '../src/core/ai/settings.ts'
import type { RepoMapConfig } from '../src/core/config.ts'
import type { ChatEvent } from '../src/shared/ai.ts'
import type { RepoGraph } from '../src/shared/types.ts'

const FAKE = join(import.meta.dirname, 'fake-claude.mjs')
const dir = mkdtempSync(join(tmpdir(), 'repomap-claude-code-'))
const log = join(dir, 'calls.jsonl')
process.env.FAKE_CLAUDE_LOG = log
const calls = () => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { args: string[]; prompt: string; cwd: string })

function settings(name: string): SettingsStore {
  const store = new SettingsStore(join(dir, `${name}.json`), { REPOMAP_CLAUDE: FAKE, PATH: '' })
  store.update({ provider: 'claude-code' })
  return store
}

describe('the Claude Code provider', () => {
  it('finds the CLI (REPOMAP_CLAUDE, else PATH) and says when it is missing', () => {
    assert.equal(claudeBinary({ REPOMAP_CLAUDE: FAKE }), FAKE)
    assert.equal(claudeBinary({ PATH: '' }), undefined)
    const missing = new SettingsStore(join(dir, 'missing.json'), { PATH: '' })
    missing.update({ provider: 'claude-code' })
    assert.match(missing.notReady() ?? '', /not found/)
    assert.equal(missing.view().hasKey, false)
    assert.equal(settings('found').notReady(), null)
    assert.equal(settings('found').view().cliPath, FAKE)
  })

  it('asks one-shot questions without tools, sessions or project settings', async () => {
    const answer = await askClaudeCode({ binary: FAKE, model: 'claude-haiku-5-5', system: 'Be brief.', prompt: '### a\ncode', cwd: dir })
    assert.deepEqual(JSON.parse(answer), { a: 'About a' })
    const { args } = calls().at(-1)!
    for (const flag of ['-p', '--no-session-persistence', '--strict-mcp-config']) assert.ok(args.includes(flag), flag)
    assert.equal(args[args.indexOf('--tools') + 1], '')
    assert.equal(args[args.indexOf('--setting-sources') + 1], 'user')
    assert.equal(args[args.indexOf('--model') + 1], 'claude-haiku-5-5')
    assert.equal(args[args.indexOf('--system-prompt') + 1], 'Be brief.')
    await assert.rejects(askClaudeCode({ binary: FAKE, model: 'm', system: 's', prompt: 'FAIL', cwd: dir }), (error: Error) => error instanceof ClaudeCodeError && /Credit balance/.test(error.message))
  })

  it("runs the Board's AI through it", async () => {
    const config = { rules: [], ai: { file: join(dir, 'ai.json'), reviewModel: 'opus', summaryModel: 'haiku' } } as unknown as RepoMapConfig
    const graph = { nodes: [], edges: [], board: { tiers: [], features: [] } } as unknown as RepoGraph
    // The fake answers a summary object, not rules: none are kept, but the call went through Claude Code.
    assert.deepEqual(await suggestRules(config, graph, { settings: settings('rules') }), [])
    assert.equal(calls().at(-1)!.args[calls().at(-1)!.args.indexOf('--model') + 1], 'opus')
  })

  it('maps permission modes to what Claude Code may do on its own', () => {
    const allowed = (mode: 'ask' | 'edits' | 'auto') => permissionArgs(mode).slice(permissionArgs(mode).indexOf('--allowedTools') + 1)
    assert.equal(permissionArgs('ask')[1], 'default')
    assert.equal(permissionArgs('edits')[1], 'acceptEdits')
    assert.ok(!allowed('ask').includes('Bash') && !allowed('edits').includes('Bash'))
    assert.ok(allowed('auto').includes('Bash'))
    assert.ok(allowed('ask').some((tool) => /^Bash\(node .*cli\.ts map-query:\*\)$/.test(tool)), 'the map lookup is always allowed')
  })

  it('streams a chat turn: text, steps, edited files, declined tools, the board; the next message resumes', async () => {
    const root = join(dir, 'repo')
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src/a.ts'), 'a\n')
    const changed: string[][] = []
    let gitRefreshes = 0
    const assistant = new Assistant({
      root: () => root,
      graph: () => undefined,
      settings: settings('chat'),
      conversations: new ConversationStore(join(dir, 'chats')),
      filesChanged: (paths) => changed.push(paths),
      gitChanged: async () => void gitRefreshes++,
    })
    assert.deepEqual((await assistant.models()).map((m) => m.id), ['opus', 'sonnet', 'haiku'])
    const events: ChatEvent[] = []
    await assistant.send({ text: 'fix it', context: [{ kind: 'node', label: 'ContactForm', text: 'the form' }], mode: 'edits' }, (e) => events.push(e))
    const call = calls().at(-1)!
    assert.equal(call.cwd, realpathSync(root))
    assert.match(call.prompt, /<context>[\s\S]*ContactForm[\s\S]*fix it/)
    assert.ok(!call.args.includes('--resume'))
    assert.equal(call.args[call.args.indexOf('--permission-mode') + 1], 'acceptEdits')
    assert.equal(events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join(''), 'Fixing it.Done.\nshow-on-board: ContactForm, `api`')
    const steps = new Map(events.filter((e): e is Extract<ChatEvent, { type: 'tool' }> => e.type === 'tool').map((e) => [e.step.id, e.step]))
    assert.equal(steps.get('tool-1')?.title, 'Edit src/a.ts')
    assert.equal(steps.get('tool-1')?.status, 'done')
    assert.equal(steps.get('tool-2')?.status, 'denied')
    assert.ok(!steps.has('sub-1'), "a subagent's steps stay inside it")
    const board = [...steps.values()].find((s) => s.name === 'show_on_board')!
    assert.deepEqual(board.input, { nodes: ['ContactForm', 'api'] })
    assert.deepEqual(changed, [['src/a.ts']])
    assert.ok(events.some((e) => e.type === 'files'))
    assert.deepEqual(events.at(-1), { type: 'done', stopReason: 'end_turn' })
    assert.equal(gitRefreshes, 1)

    const conversationId = (events[0] as Extract<ChatEvent, { type: 'start' }>).conversation.id
    await assistant.send({ conversationId, text: 'and the test' }, () => undefined)
    const again = calls().at(-1)!
    assert.equal(again.args[again.args.indexOf('--resume') + 1], 'session-1')
    assert.equal(again.args[again.args.indexOf('--permission-mode') + 1], 'default', 'settings default: ask')
  })
})
